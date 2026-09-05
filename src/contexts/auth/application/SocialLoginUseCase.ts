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

// 앱에서 온 이름 정리: 공백 트림·빈 문자열은 무시·과도한 길이 컷(방어).
function normalizeName(name?: string): string | undefined {
  const trimmed = name?.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, 50);
}

export class SocialLoginUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly tokenService: ITokenService,
    private readonly providers: Record<SocialProvider, ISocialAuthProvider>,
  ) {}

  // displayName: 애플 로그인 보완용. 애플 id_token엔 이름이 없고(AppleAuthProvider가 nickname=null),
  // 애플은 이름을 "최초 동의 시 credential.fullName으로 딱 한 번"만 준다 → 앱이 그 이름을 함께 보낸다.
  // provider가 닉네임을 주면(카카오·네이버) 그걸 우선하고, 없을 때만 이 이름으로 채운다.
  async execute(
    provider: SocialProvider,
    accessToken: string,
    displayName?: string,
  ): Promise<SocialLoginResult> {
    const authProvider = this.providers[provider];
    if (!authProvider) throw Errors.socialLoginFailed({ provider });

    let profile;
    try {
      profile = await authProvider.getProfile(accessToken);
    } catch {
      throw Errors.socialLoginFailed({ provider });
    }

    // provider 닉네임 우선, 없으면 앱이 넘긴 이름(애플 최초 로그인). updateProfile은 COALESCE라 null이면 기존 유지.
    const nickname = profile.nickname ?? normalizeName(displayName) ?? null;

    const existing = await this.userRepo.findBySocial(provider, profile.socialId);
    const isNewUser = !existing;

    if (existing?.status === 'banned') throw Errors.userBanned();

    let user;
    if (existing) {
      // 기존 유저 — 소셜 프로필 최신 정보로 업데이트
      await this.userRepo.updateProfile(existing.id, nickname, profile.profileImage);
      user = { ...existing, nickname: nickname ?? existing.nickname, profileImage: profile.profileImage ?? existing.profileImage };
    } else {
      // 신규 유저 + 소셜 계정 생성 (애플이면 닉네임이 앱에서 온 이름)
      user = await this.userRepo.createUser({ ...profile, nickname });
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
