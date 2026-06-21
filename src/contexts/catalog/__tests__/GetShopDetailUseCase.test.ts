import { GetShopDetailUseCase } from '../application/GetShopDetailUseCase';
import { IShopRepository } from '../ports/IShopRepository';
import { Shop } from '../domain/Shop';
import { AppError } from '../../../shared/errors/AppError';
import { ErrorCode } from '../../../shared/errors/ErrorCode';

const mockShop: Shop = {
  id: 'shop-1',
  name: '태닝나우 문정점',
  region: '서울',
  district: '강남',
  minPrice: 20000,
  priceTier: '2만원대',
  categories: ['nail'],
  todayOpen: true,
  slotSummary: [],
  eventDesc: null,
  eventPrice: null,
  bizId: 'biz-1',
  isPartner: false,
  lat: 37.5,
  lng: 127.1,
  photos: [],
  reviewCount: 10,
  bookingUrl: null,
  phone: null,
};

function makeRepo(overrides: Partial<IShopRepository> = {}): IShopRepository {
  return {
    findMany: jest.fn(),
    findById: jest.fn().mockResolvedValue(mockShop),
    ...overrides,
  };
}

describe('GetShopDetailUseCase', () => {
  it('존재하는 샵 ID로 샵 상세를 반환한다', async () => {
    const useCase = new GetShopDetailUseCase(makeRepo());
    const shop = await useCase.execute('shop-1');
    expect(shop.name).toBe('태닝나우 문정점');
  });

  it('존재하지 않는 샵 ID이면 SHOP_NOT_FOUND 에러를 던진다', async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(null) });
    const useCase = new GetShopDetailUseCase(repo);
    await expect(useCase.execute('unknown')).rejects.toMatchObject({ code: ErrorCode.SHOP_NOT_FOUND });
  });
});
