import { RemoveFavoriteUseCase } from '../application/RemoveFavoriteUseCase';
import { IFavoriteRepository } from '../ports/IFavoriteRepository';
import { ErrorCode } from '../../../shared/errors/ErrorCode';

function makeRepo(exists = true): IFavoriteRepository {
  return {
    findByUser: jest.fn(),
    exists: jest.fn().mockResolvedValue(exists),
    add: jest.fn(),
    remove: jest.fn().mockResolvedValue(undefined),
  };
}

describe('RemoveFavoriteUseCase', () => {
  it('즐겨찾기를 삭제한다', async () => {
    const repo = makeRepo(true);
    const useCase = new RemoveFavoriteUseCase(repo);
    await useCase.execute('user-1', 'shop-1');
    expect(repo.remove).toHaveBeenCalledWith('user-1', 'shop-1');
  });

  it('등록되지 않은 샵이면 FAVORITE_NOT_FOUND 에러를 던진다', async () => {
    const useCase = new RemoveFavoriteUseCase(makeRepo(false));
    await expect(useCase.execute('user-1', 'shop-1'))
      .rejects.toMatchObject({ code: ErrorCode.FAVORITE_NOT_FOUND });
  });
});
