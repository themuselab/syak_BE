import { IUserRepository } from '../ports/IUserRepository';
import { ISocialAuthProvider } from '../ports/ISocialAuthProvider';
import { SocialProvider } from '../domain/User';
import { Errors } from '../../../shared/errors/AppError';

export interface LinkResult {
  linkedProvider: SocialProvider;
}

export class LinkSocialAccountUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly providers: Record<SocialProvider, ISocialAuthProvider>,
  ) {}

  async execute(userId: string, provider: SocialProvider, accessToken: string): Promise<LinkResult> {
    const authProvider = this.providers[provider];
    if (!authProvider) throw Errors.socialLoginFailed({ provider });

    let profile;
    try {
      profile = await authProvider.getProfile(accessToken);
    } catch {
      throw Errors.socialLoginFailed({ provider });
    }

    const linkedUserId = await this.userRepo.findUserIdBySocial(provider, profile.socialId);

    if (linkedUserId && linkedUserId !== userId) {
      // 다른 계정에 이미 연결됨 — 연동 불가
      throw Errors.forbidden({ reason: '이미 다른 계정에 연결된 소셜 계정입니다' });
    }

    if (!linkedUserId) {
      // 아직 연결 없음 → 연결
      await this.userRepo.linkSocialAccount(userId, provider, profile.socialId);
    }
    // linkedUserId === userId 인 경우는 이미 연결 → 멱등 처리

    return { linkedProvider: provider };
  }
}
