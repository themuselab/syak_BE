import { IUserRepository } from '../ports/IUserRepository';
import { ITokenService } from '../ports/ITokenService';
import { ISocialAuthProvider } from '../ports/ISocialAuthProvider';
import { SocialProvider } from '../domain/User';
import { AuthToken } from '../domain/AuthToken';
import { Errors } from '../../../shared/errors/AppError';

export interface SocialLoginResult {
  token: AuthToken;
  user: { id: string; nickname: string | null; profileImage: string | null };
  isNewUser: boolean;
}

export class SocialLoginUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly tokenService: ITokenService,
    private readonly providers: Record<SocialProvider, ISocialAuthProvider>,
  ) {}

  async execute(provider: SocialProvider, accessToken: string): Promise<SocialLoginResult> {
    const authProvider = this.providers[provider];
    if (!authProvider) throw Errors.socialLoginFailed({ provider });

    let profile;
    try {
      profile = await authProvider.getProfile(accessToken);
    } catch {
      throw Errors.socialLoginFailed({ provider });
    }

    const existing = await this.userRepo.findBySocial(provider, profile.socialId);
    const isNewUser = !existing;

    if (existing?.status === 'banned') throw Errors.userBanned();

    let user;
    if (existing) {
      // 기존 유저 — 소셜 프로필 최신 정보로 업데이트
      await this.userRepo.updateProfile(existing.id, profile.nickname, profile.profileImage);
      user = { ...existing, nickname: profile.nickname ?? existing.nickname, profileImage: profile.profileImage ?? existing.profileImage };
    } else {
      // 신규 유저 + 소셜 계정 생성
      user = await this.userRepo.createUser(profile);
    }

    const token = this.tokenService.issueTokens(user.id);
    const refreshExpiry = this.tokenService.getRefreshExpiry();
    await this.userRepo.saveRefreshToken(user.id, token.refreshToken, refreshExpiry);

    return {
      token,
      user: { id: user.id, nickname: user.nickname, profileImage: user.profileImage },
      isNewUser,
    };
  }
}
