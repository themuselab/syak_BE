import { RemoveFavoriteUseCase } from '../application/RemoveFavoriteUseCase';
import { IFavoriteRepository } from '../ports/IFavoriteRepository';
import { ErrorCode } from '../../../shared/errors/ErrorCode';

function makeRepo(exists = true): IFavoriteRepository {
  return {
    findByUser: jest.fn(),
    exists: jest.fn().mockResolvedValue(exists),
    add: jest.fn(),
    remove: jest.fn().mockResolvedValue(undefined),
    recordEvent: jest.fn().mockResolvedValue(undefined),
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

  it('삭제 성공 시 favorite_events 에 remove 를 기록한다', async () => {
    const repo = makeRepo(true);
    await new RemoveFavoriteUseCase(repo).execute('user-1', 'shop-1');
    await new Promise((r) => setImmediate(r));
    expect(repo.recordEvent).toHaveBeenCalledWith('user-1', 'shop-1', 'remove');
  });

  it('favorite_events 기록이 실패해도 삭제는 성공한다', async () => {
    const repo = makeRepo(true);
    (repo.recordEvent as jest.Mock).mockRejectedValue(new Error('db down'));
    await expect(new RemoveFavoriteUseCase(repo).execute('user-1', 'shop-1')).resolves.toBeUndefined();
    await new Promise((r) => setImmediate(r));
    expect(repo.remove).toHaveBeenCalled();
  });

  it('없는 즐겨찾기 삭제 실패 시 이벤트를 기록하지 않는다', async () => {
    const repo = makeRepo(false);
    await expect(new RemoveFavoriteUseCase(repo).execute('user-1', 'shop-1')).rejects.toBeDefined();
    expect(repo.recordEvent).not.toHaveBeenCalled();
  });
});
