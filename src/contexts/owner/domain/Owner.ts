export type SocialProvider = 'kakao' | 'naver' | 'apple';

export interface OwnerAccount {
  id: string;
  shopId: string | null;
  nickname: string | null;
  profileImage: string | null;
  createdAt: Date;
}

export interface OwnerSocialProfile {
  provider: SocialProvider;
  socialId: string;
  nickname?: string;
  profileImage?: string;
}

export interface OwnerToken {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}
