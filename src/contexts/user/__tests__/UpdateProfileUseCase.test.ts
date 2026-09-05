import { UpdateProfileUseCase } from '../application/UpdateProfileUseCase';
import { IUserProfileRepository } from '../ports/IUserProfileRepository';
import { UserProfile } from '../domain/UserProfile';
import { ErrorCode } from '../../../shared/errors/ErrorCode';

const updated: UserProfile = {
  id: 'user-1', linkedProviders: ['apple'], nickname: '새닉', profileImage: null, createdAt: new Date(),
};

function makeRepo(): IUserProfileRepository {
  return {
    findById: jest.fn().mockResolvedValue(updated),
    updateNickname: jest.fn().mockResolvedValue(undefined),
    deleteById: jest.fn(),
  };
}

describe('UpdateProfileUseCase', () => {
  it('닉네임을 트림해 저장하고 갱신된 프로필을 반환한다', async () => {
    const repo = makeRepo();
    const result = await new UpdateProfileUseCase(repo).execute('user-1', '  새닉  ');
    expect(repo.updateNickname).toHaveBeenCalledWith('user-1', '새닉');
    expect(result.nickname).toBe('새닉');
  });

  it('빈 닉네임이면 VALIDATION 에러를 던진다', async () => {
    await expect(new UpdateProfileUseCase(makeRepo()).execute('user-1', '   '))
      .rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
  });

  it('20자를 초과하면 VALIDATION 에러를 던진다', async () => {
    await expect(new UpdateProfileUseCase(makeRepo()).execute('user-1', '가'.repeat(21)))
      .rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
  });
});
