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

  async execute(provider: SocialProvider, accessToken: string): Promise<OwnerLoginResult> {
    const authProvider = this.providers[provider];
    if (!authProvider) throw Errors.socialLoginFailed({ provider });

    let profile;
    try {
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
