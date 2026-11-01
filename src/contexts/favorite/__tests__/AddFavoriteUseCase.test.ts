import { AddFavoriteUseCase } from '../application/AddFavoriteUseCase';
import { IFavoriteRepository } from '../ports/IFavoriteRepository';
import { IShopRepository } from '../../catalog/ports/IShopRepository';
import { Favorite } from '../domain/Favorite';
import { ErrorCode } from '../../../shared/errors/ErrorCode';

const mockFav: Favorite = {
  id: 'fav-1', userId: 'user-1', shopId: 'shop-1',
  shopName: '태닝나우', shopRegion: '강남', createdAt: new Date(),
};

const mockShop = { id: 'shop-1', name: '태닝나우', region: '강남' } as any;

function makeFavRepo(exists = false): IFavoriteRepository {
  return {
    findByUser: jest.fn(),
    exists: jest.fn().mockResolvedValue(exists),
    add: jest.fn().mockResolvedValue(mockFav),
    remove: jest.fn(),
    recordEvent: jest.fn().mockResolvedValue(undefined),
  };
}

function makeShopRepo(shop = mockShop): Partial<IShopRepository> {
  return { findById: jest.fn().mockResolvedValue(shop) };
}

describe('AddFavoriteUseCase', () => {
  it('즐겨찾기를 추가하고 결과를 반환한다', async () => {
    const favRepo = makeFavRepo(false);
    const shopRepo = makeShopRepo();
    const useCase = new AddFavoriteUseCase(favRepo, shopRepo as IShopRepository);
    const result = await useCase.execute('user-1', 'shop-1');
    expect(result).toBe(mockFav);
    expect(favRepo.add).toHaveBeenCalledWith('user-1', 'shop-1', '태닝나우', '강남');
  });

  it('이미 즐겨찾기된 샵이면 FAVORITE_ALREADY_EXISTS 에러를 던진다', async () => {
    const useCase = new AddFavoriteUseCase(makeFavRepo(true), makeShopRepo() as IShopRepository);
    await expect(useCase.execute('user-1', 'shop-1'))
      .rejects.toMatchObject({ code: ErrorCode.FAVORITE_ALREADY_EXISTS });
  });

  it('존재하지 않는 샵이면 SHOP_NOT_FOUND 에러를 던진다', async () => {
    const useCase = new AddFavoriteUseCase(makeFavRepo(false), makeShopRepo(null) as IShopRepository);
    await expect(useCase.execute('user-1', 'bad-shop'))
      .rejects.toMatchObject({ code: ErrorCode.SHOP_NOT_FOUND });
  });

  it('추가 성공 시 favorite_events 에 add 를 기록한다', async () => {
    const favRepo = makeFavRepo(false);
    await new AddFavoriteUseCase(favRepo, makeShopRepo() as IShopRepository).execute('user-1', 'shop-1');
    await new Promise((r) => setImmediate(r));
    expect(favRepo.recordEvent).toHaveBeenCalledWith('user-1', 'shop-1', 'add');
  });

  it('favorite_events 기록이 실패(reject/throw)해도 추가는 성공한다', async () => {
    const favRepo = makeFavRepo(false);
    (favRepo.recordEvent as jest.Mock).mockRejectedValueOnce(new Error('relation "favorite_events" does not exist'));
    const useCase = new AddFavoriteUseCase(favRepo, makeShopRepo() as IShopRepository);
    await expect(useCase.execute('user-1', 'shop-1')).resolves.toBe(mockFav);

    (favRepo.recordEvent as jest.Mock).mockImplementationOnce(() => { throw new Error('sync boom'); });
    await expect(useCase.execute('user-1', 'shop-1')).resolves.toBe(mockFav);
    await new Promise((r) => setImmediate(r));
  });

  it('이미 즐겨찾기면 이벤트를 기록하지 않는다', async () => {
    const favRepo = makeFavRepo(true);
    await expect(new AddFavoriteUseCase(favRepo, makeShopRepo() as IShopRepository).execute('user-1', 'shop-1')).rejects.toBeDefined();
    expect(favRepo.recordEvent).not.toHaveBeenCalled();
  });
});
