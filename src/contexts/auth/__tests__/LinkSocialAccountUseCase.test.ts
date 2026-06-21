import { LinkSocialAccountUseCase } from '../application/LinkSocialAccountUseCase';
import { IUserRepository } from '../ports/IUserRepository';
import { ISocialAuthProvider } from '../ports/ISocialAuthProvider';
import { AppError } from '../../../shared/errors/AppError';

function makeRepo(overrides: Partial<IUserRepository> = {}): IUserRepository {
  return {
    findBySocial: jest.fn().mockResolvedValue(null),
    findUserIdBySocial: jest.fn().mockResolvedValue(null),
    createUser: jest.fn(),
    linkSocialAccount: jest.fn().mockResolvedValue(undefined),
    updateProfile: jest.fn().mockResolvedValue(undefined),
    deleteById: jest.fn(),
    saveRefreshToken: jest.fn(),
    findRefreshToken: jest.fn(),
    deleteRefreshToken: jest.fn(),
    deleteAllRefreshTokens: jest.fn(),
    ...overrides,
  };
}

function makeProvider(socialId = 'naver-456'): ISocialAuthProvider {
  return {
    getProfile: jest.fn().mockResolvedValue({
      provider: 'naver' as const,
      socialId,
      nickname: '연결유저',
      profileImage: null,
    }),
  };
}

function makeUseCase(repoOverrides: Partial<IUserRepository> = {}) {
  return new LinkSocialAccountUseCase(makeRepo(repoOverrides), {
    kakao: makeProvider(), naver: makeProvider(), apple: makeProvider(),
  });
}

describe('LinkSocialAccountUseCase', () => {
  it('연결되지 않은 소셜 계정을 성공적으로 연결한다', async () => {
    const repo = makeRepo({ findUserIdBySocial: jest.fn().mockResolvedValue(null) });
    const useCase = new LinkSocialAccountUseCase(repo, { kakao: makeProvider(), naver: makeProvider(), apple: makeProvider() });
    const result = await useCase.execute('user-1', 'naver', 'valid-token');
    expect(result.linkedProvider).toBe('naver');
    expect(repo.linkSocialAccount).toHaveBeenCalledWith('user-1', 'naver', 'naver-456');
  });

  it('이미 자신에게 연결된 계정은 멱등으로 처리한다', async () => {
    const repo = makeRepo({ findUserIdBySocial: jest.fn().mockResolvedValue('user-1') });
    const useCase = new LinkSocialAccountUseCase(repo, { kakao: makeProvider(), naver: makeProvider(), apple: makeProvider() });
    const result = await useCase.execute('user-1', 'naver', 'valid-token');
    expect(result.linkedProvider).toBe('naver');
    expect(repo.linkSocialAccount).not.toHaveBeenCalled();  // 이미 연결됨 — DB 재호출 없음
  });

  it('다른 계정에 이미 연결된 소셜 계정은 연결을 거부한다', async () => {
    const repo = makeRepo({ findUserIdBySocial: jest.fn().mockResolvedValue('other-user') });
    const useCase = new LinkSocialAccountUseCase(repo, { kakao: makeProvider(), naver: makeProvider(), apple: makeProvider() });
    await expect(useCase.execute('user-1', 'naver', 'valid-token')).rejects.toBeInstanceOf(AppError);
  });

  it('소셜 프로바이더 오류 시 socialLoginFailed를 던진다', async () => {
    const failingProvider: ISocialAuthProvider = { getProfile: jest.fn().mockRejectedValue(new Error('401')) };
    const useCase = new LinkSocialAccountUseCase(makeRepo(), { kakao: makeProvider(), naver: failingProvider, apple: makeProvider() });
    await expect(useCase.execute('user-1', 'naver', 'bad-token')).rejects.toBeInstanceOf(AppError);
  });

  it('지원하지 않는 provider는 에러를 던진다', async () => {
    await expect(makeUseCase().execute('user-1', 'google' as never, 'token')).rejects.toBeInstanceOf(AppError);
  });
});
