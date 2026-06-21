import { RefreshTokenUseCase } from '../application/RefreshTokenUseCase';
import { IUserRepository } from '../ports/IUserRepository';
import { ITokenService } from '../ports/ITokenService';
import { AppError } from '../../../shared/errors/AppError';
import { AuthToken } from '../domain/AuthToken';

const mockToken: AuthToken = { accessToken: 'new-access', refreshToken: 'new-refresh', expiresIn: 3600 };

function makeRepo(overrides: Partial<IUserRepository> = {}): IUserRepository {
  return {
    findBySocial: jest.fn(),
    findUserIdBySocial: jest.fn(),
    createUser: jest.fn(),
    linkSocialAccount: jest.fn(),
    updateProfile: jest.fn(),
    deleteById: jest.fn(),
    saveRefreshToken: jest.fn().mockResolvedValue(undefined),
    findRefreshToken: jest.fn().mockResolvedValue({
      id: 'rt-1', userId: 'user-1', token: 'old-refresh', expiresAt: new Date(Date.now() + 86400000),
    }),
    deleteRefreshToken: jest.fn().mockResolvedValue(undefined),
    deleteAllRefreshTokens: jest.fn(),
    ...overrides,
  };
}

function makeTokenService(): ITokenService {
  return {
    issueTokens: jest.fn().mockReturnValue(mockToken),
    generateRefreshToken: jest.fn().mockReturnValue('new-refresh'),
    getRefreshExpiry: jest.fn().mockReturnValue(new Date(Date.now() + 86400000)),
  };
}

describe('RefreshTokenUseCase', () => {
  it('유효한 refresh token으로 새 토큰을 발급한다', async () => {
    const useCase = new RefreshTokenUseCase(makeRepo(), makeTokenService());
    const token = await useCase.execute('old-refresh');
    expect(token.accessToken).toBe('new-access');
  });

  it('존재하지 않는 refresh token이면 refreshInvalid 에러를 던진다', async () => {
    const repo = makeRepo({ findRefreshToken: jest.fn().mockResolvedValue(null) });
    const useCase = new RefreshTokenUseCase(repo, makeTokenService());
    await expect(useCase.execute('unknown')).rejects.toBeInstanceOf(AppError);
  });

  it('만료된 refresh token이면 삭제 후 refreshInvalid 에러를 던진다', async () => {
    const repo = makeRepo({
      findRefreshToken: jest.fn().mockResolvedValue({
        id: 'rt-1', userId: 'user-1', token: 'expired', expiresAt: new Date(Date.now() - 1000),
      }),
    });
    const useCase = new RefreshTokenUseCase(repo, makeTokenService());
    await expect(useCase.execute('expired')).rejects.toBeInstanceOf(AppError);
    expect(repo.deleteRefreshToken).toHaveBeenCalledWith('expired');
  });

  it('성공 시 기존 토큰을 삭제하고 새 토큰을 저장한다', async () => {
    const repo = makeRepo();
    const useCase = new RefreshTokenUseCase(repo, makeTokenService());
    await useCase.execute('old-refresh');
    expect(repo.deleteRefreshToken).toHaveBeenCalledWith('old-refresh');
    expect(repo.saveRefreshToken).toHaveBeenCalledWith('user-1', 'new-refresh', expect.any(Date));
  });
});
