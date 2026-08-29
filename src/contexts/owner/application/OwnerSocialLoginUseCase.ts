import { IOwnerRepository } from '../ports/IOwnerRepository';
import { IOwnerTokenService } from '../ports/IOwnerTokenService';
import { ISocialAuthProvider } from '../../auth/ports/ISocialAuthProvider';
import { SocialProvider, OwnerToken, OwnerAccount } from '../domain/Owner';
import { Errors } from '../../../shared/errors/AppError';

export interface OwnerLoginResult {
  token: OwnerToken;
  owner: { id: string; nickname: string | null; shopId: string | null };
  isNewOwner: boolean;
}

export class OwnerSocialLoginUseCase {
  constructor(
    private readonly ownerRepo: IOwnerRepository,
    private readonly tokenService: IOwnerTokenService,
    private readonly providers: Record<SocialProvider, ISocialAuthProvider>,
  ) {}

  // 네이티브 앱은 access_token을, 웹 authorize 플로우는 code(+redirectUri)를 준다.
  async execute(
    provider: SocialProvider,
    credential: { accessToken?: string; code?: string; redirectUri?: string; state?: string },
  ): Promise<OwnerLoginResult> {
    const authProvider = this.providers[provider];
    if (!authProvider) throw Errors.socialLoginFailed({ provider });

    let profile;
    try {
      // 웹 코드 플로우: code → access_token 교환(provider가 지원할 때). 아니면 그대로 access_token 사용.
      let accessToken = credential.accessToken;
      if (!accessToken && credential.code && authProvider.exchangeCode) {
        accessToken = await authProvider.exchangeCode(
          credential.code, credential.redirectUri ?? '', credential.state,
        );
      }
      if (!accessToken) throw new Error('no token');
      profile = await authProvider.getProfile(accessToken);
    } catch {
      throw Errors.socialLoginFailed({ provider });
    }

    const existing = await this.ownerRepo.findBySocial(provider, profile.socialId);
    const isNewOwner = !existing;
    let owner: OwnerAccount;

    if (existing) {
      await this.ownerRepo.updateProfile(
        existing.id,
        profile.nickname ?? undefined,
        profile.profileImage ?? undefined,
      );
      owner = {
        ...existing,
        nickname:     profile.nickname     ?? existing.nickname,
        profileImage: profile.profileImage ?? existing.profileImage,
      };
    } else {
      owner = await this.ownerRepo.createWithSocial({
        provider,
        socialId:     profile.socialId,
        nickname:     profile.nickname     ?? undefined,
        profileImage: profile.profileImage ?? undefined,
      });
    }

    const token = this.tokenService.issueTokens(owner.id, owner.shopId);
    const refreshExpiry = this.tokenService.getRefreshExpiry();
    await this.ownerRepo.saveRefreshToken(owner.id, token.refreshToken, refreshExpiry);

    return {
      token,
      owner: { id: owner.id, nickname: owner.nickname, shopId: owner.shopId },
      isNewOwner,
    };
  }
}
