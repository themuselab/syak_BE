export type SocialProvider = 'kakao' | 'naver' | 'apple';

export interface User {
  id: string;
  nickname: string | null;
  profileImage: string | null;
  createdAt: Date;
  status: 'active' | 'banned';
}

export interface SocialProfile {
  provider: SocialProvider;
  socialId: string;
  nickname: string | null;
  profileImage: string | null;
}
