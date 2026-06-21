import { OwnerAccount, SocialProvider, OwnerSocialProfile } from '../domain/Owner';

export interface IOwnerRepository {
  findBySocial(provider: SocialProvider, socialId: string): Promise<OwnerAccount | null>;
  findById(id: string): Promise<OwnerAccount | null>;
  createWithSocial(profile: OwnerSocialProfile): Promise<OwnerAccount>;
  updateProfile(ownerId: string, nickname?: string, profileImage?: string): Promise<void>;
  linkShop(ownerId: string, shopId: string): Promise<void>;
  saveRefreshToken(ownerId: string, token: string, expiresAt: Date): Promise<void>;
  findByRefreshToken(token: string): Promise<OwnerAccount | null>;
  deleteRefreshToken(token: string): Promise<void>;
  deleteAllRefreshTokens(ownerId: string): Promise<void>;
}
