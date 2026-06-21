import { WithdrawUseCase } from '../application/WithdrawUseCase';
import { IUserProfileRepository } from '../ports/IUserProfileRepository';

function makeRepo(): IUserProfileRepository {
  return {
    findById: jest.fn(),
    deleteById: jest.fn().mockResolvedValue(undefined),
  };
}

describe('WithdrawUseCase', () => {
  it('유저를 삭제한다', async () => {
    const repo = makeRepo();
    await new WithdrawUseCase(repo).execute('u1');
    expect(repo.deleteById).toHaveBeenCalledWith('u1');
  });
});
