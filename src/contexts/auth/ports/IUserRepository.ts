import { User, SocialProvider, SocialProfile } from '../domain/User';
import { RefreshTokenRecord } from '../domain/AuthToken';

export interface IUserRepository {
  /** 소셜 계정으로 연결된 유저 조회 */
  findBySocial(provider: SocialProvider, socialId: string): Promise<User | null>;

  /** 특정 소셜 계정이 어떤 userId에 연결되어 있는지 반환 (없으면 null) */
  findUserIdBySocial(provider: SocialProvider, socialId: string): Promise<string | null>;

  /** 신규 유저 생성 + 소셜 계정 연결 */
  createUser(profile: SocialProfile): Promise<User>;

  /** 기존 유저에 추가 소셜 계정 연결 */
  linkSocialAccount(userId: string, provider: SocialProvider, socialId: string): Promise<void>;

  /** 프로필 업데이트 (소셜 로그인 시 최신 정보 반영) */
  updateProfile(userId: string, nickname: string | null, profileImage: string | null): Promise<void>;

  updateStatus(userId: string, status: 'active' | 'banned'): Promise<void>;
  deleteById(userId: string): Promise<void>;

  saveRefreshToken(userId: string, token: string, expiresAt: Date): Promise<void>;
  findRefreshToken(token: string): Promise<RefreshTokenRecord | null>;
  deleteRefreshToken(token: string): Promise<void>;
  deleteAllRefreshTokens(userId: string): Promise<void>;
}
