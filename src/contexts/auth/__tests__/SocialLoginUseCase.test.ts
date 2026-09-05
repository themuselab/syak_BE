import { SocialLoginUseCase } from '../application/SocialLoginUseCase';
import { IUserRepository } from '../ports/IUserRepository';
import { ITokenService } from '../ports/ITokenService';
import { ISocialAuthProvider } from '../ports/ISocialAuthProvider';
import { User } from '../domain/User';
import { AuthToken } from '../domain/AuthToken';
import { AppError } from '../../../shared/errors/AppError';

const mockUser: User = { id: 'user-1', nickname: '민지', profileImage: null, createdAt: new Date(), status: 'active' };
const mockToken: AuthToken = { accessToken: 'access', refreshToken: 'refresh', expiresIn: 900 };

function makeRepo(overrides: Partial<IUserRepository> = {}): IUserRepository {
  return {
    findBySocial: jest.fn().mockResolvedValue(null),
    findUserIdBySocial: jest.fn().mockResolvedValue(null),
    createUser: jest.fn().mockResolvedValue(mockUser),
    linkSocialAccount: jest.fn().mockResolvedValue(undefined),
    updateProfile: jest.fn().mockResolvedValue(undefined),
    updateStatus: jest.fn().mockResolvedValue(undefined),
    deleteById: jest.fn().mockResolvedValue(undefined),
    saveRefreshToken: jest.fn().mockResolvedValue(undefined),
    findRefreshToken: jest.fn().mockResolvedValue(null),
    deleteRefreshToken: jest.fn().mockResolvedValue(undefined),
    deleteAllRefreshTokens: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeTokenService(): ITokenService {
  return {
    issueTokens: jest.fn().mockReturnValue(mockToken),
    generateRefreshToken: jest.fn().mockReturnValue('refresh'),
    getRefreshExpiry: jest.fn().mockReturnValue(new Date(Date.now() + 86400000)),
  };
}

function makeProvider(): ISocialAuthProvider {
  return {
    getProfile: jest.fn().mockResolvedValue({
      provider: 'kakao' as const,
      socialId: 'kakao-123',
      nickname: '민지',
      profileImage: null,
    }),
  };
}

function makeUseCase(repoOverrides: Partial<IUserRepository> = {}) {
  return new SocialLoginUseCase(makeRepo(repoOverrides), makeTokenService(), {
    kakao: makeProvider(), naver: makeProvider(), apple: makeProvider(),
  });
}

describe('SocialLoginUseCase', () => {
  it('신규 유저로 로그인 시 isNewUser=true를 반환한다', async () => {
    const result = await makeUseCase().execute('kakao', 'valid-token');
    expect(result.isNewUser).toBe(true);
    expect(result.token.accessToken).toBe('access');
  });

  it('기존 유저로 로그인 시 isNewUser=false를 반환한다', async () => {
    const result = await makeUseCase({ findBySocial: jest.fn().mockResolvedValue(mockUser) }).execute('kakao', 'valid-token');
    expect(result.isNewUser).toBe(false);
  });

  it('신규 유저 로그인 시 createUser를 호출한다', async () => {
    const repo = makeRepo();
    await new SocialLoginUseCase(repo, makeTokenService(), { kakao: makeProvider(), naver: makeProvider(), apple: makeProvider() }).execute('kakao', 'token');
    expect(repo.createUser).toHaveBeenCalled();
  });

  it('기존 유저 로그인 시 프로필을 업데이트한다', async () => {
    const repo = makeRepo({ findBySocial: jest.fn().mockResolvedValue(mockUser) });
    await new SocialLoginUseCase(repo, makeTokenService(), { kakao: makeProvider(), naver: makeProvider(), apple: makeProvider() }).execute('kakao', 'token');
    expect(repo.updateProfile).toHaveBeenCalledWith('user-1', '민지', null);
  });

  it('애플처럼 provider 닉네임이 없으면 앱이 넘긴 이름으로 닉네임을 채운다', async () => {
    const appleProvider: ISocialAuthProvider = {
      getProfile: jest.fn().mockResolvedValue({
        provider: 'apple' as const, socialId: 'apple-999', nickname: null, profileImage: null,
      }),
    };
    const repo = makeRepo();
    await new SocialLoginUseCase(repo, makeTokenService(), {
      kakao: makeProvider(), naver: makeProvider(), apple: appleProvider,
    }).execute('apple', 'id-token', '홍길동');
    expect(repo.createUser).toHaveBeenCalledWith(expect.objectContaining({ nickname: '홍길동' }));
  });

  it('provider가 닉네임을 주면 앱이 넘긴 이름은 무시한다', async () => {
    const repo = makeRepo();
    await new SocialLoginUseCase(repo, makeTokenService(), {
      kakao: makeProvider(), naver: makeProvider(), apple: makeProvider(),
    }).execute('kakao', 'token', '무시될이름');
    expect(repo.createUser).toHaveBeenCalledWith(expect.objectContaining({ nickname: '민지' }));
  });

  it('소셜 프로바이더가 에러를 던지면 socialLoginFailed 에러를 던진다', async () => {
    const provider: ISocialAuthProvider = { getProfile: jest.fn().mockRejectedValue(new Error('network')) };
    const useCase = new SocialLoginUseCase(makeRepo(), makeTokenService(), { kakao: provider, naver: makeProvider(), apple: makeProvider() });
    await expect(useCase.execute('kakao', 'bad-token')).rejects.toBeInstanceOf(AppError);
  });

  it('지원하지 않는 provider를 넘기면 socialLoginFailed 에러를 던진다', async () => {
    await expect(makeUseCase().execute('google' as never, 'token')).rejects.toBeInstanceOf(AppError);
  });

  it('로그인 성공 시 refresh 토큰을 저장한다', async () => {
    const repo = makeRepo();
    await new SocialLoginUseCase(repo, makeTokenService(), { kakao: makeProvider(), naver: makeProvider(), apple: makeProvider() }).execute('kakao', 'token');
    expect(repo.saveRefreshToken).toHaveBeenCalledWith('user-1', 'refresh', expect.any(Date));
  });
});
