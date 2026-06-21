import { GetProfileUseCase } from '../application/GetProfileUseCase';
import { IUserProfileRepository } from '../ports/IUserProfileRepository';
import { UserProfile } from '../domain/UserProfile';
import { ErrorCode } from '../../../shared/errors/ErrorCode';

const mockProfile: UserProfile = {
  id: 'user-1', linkedProviders: ['kakao'], nickname: '민지', profileImage: null, createdAt: new Date(),
};

function makeRepo(profile: UserProfile | null = mockProfile): IUserProfileRepository {
  return {
    findById: jest.fn().mockResolvedValue(profile),
    deleteById: jest.fn(),
  };
}

describe('GetProfileUseCase', () => {
  it('존재하는 유저의 프로필을 반환한다', async () => {
    const useCase = new GetProfileUseCase(makeRepo());
    const result = await useCase.execute('user-1');
    expect(result.nickname).toBe('민지');
  });

  it('유저가 없으면 AUTH_UNAUTHORIZED 에러를 던진다', async () => {
    const useCase = new GetProfileUseCase(makeRepo(null));
    await expect(useCase.execute('user-x'))
      .rejects.toMatchObject({ code: ErrorCode.AUTH_UNAUTHORIZED });
  });
});
