import { SignOutUseCase } from '../application/SignOutUseCase';
import { IUserRepository } from '../ports/IUserRepository';

function makeRepo(): IUserRepository {
  return {
    findBySocial: jest.fn(),
    findUserIdBySocial: jest.fn(),
    createUser: jest.fn(),
    linkSocialAccount: jest.fn(),
    updateProfile: jest.fn(),
    deleteById: jest.fn(),
    saveRefreshToken: jest.fn(),
    findRefreshToken: jest.fn(),
    deleteRefreshToken: jest.fn(),
    deleteAllRefreshTokens: jest.fn().mockResolvedValue(undefined),
  };
}

describe('SignOutUseCase', () => {
  it('유저의 모든 refresh 토큰을 삭제한다', async () => {
    const repo = makeRepo();
    await new SignOutUseCase(repo).execute('user-1');
    expect(repo.deleteAllRefreshTokens).toHaveBeenCalledWith('user-1');
  });
});
