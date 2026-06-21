import { GetShopsUseCase } from '../application/GetShopsUseCase';
import { IShopRepository, ShopListResult } from '../ports/IShopRepository';

const mockResult: ShopListResult = {
  items: [],
  total: 0,
  page: 1,
  limit: 20,
};

function makeRepo(overrides: Partial<IShopRepository> = {}): IShopRepository {
  return {
    findMany: jest.fn().mockResolvedValue(mockResult),
    findById: jest.fn(),
    ...overrides,
  };
}

describe('GetShopsUseCase', () => {
  it('기본 페이지/리밋으로 샵 목록을 반환한다', async () => {
    const repo = makeRepo();
    const useCase = new GetShopsUseCase(repo);
    const result = await useCase.execute({});
    expect(repo.findMany).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 20 }));
    expect(result).toBe(mockResult);
  });

  it('limit이 100을 초과하면 100으로 클램핑한다', async () => {
    const repo = makeRepo();
    const useCase = new GetShopsUseCase(repo);
    await useCase.execute({ limit: 999 });
    expect(repo.findMany).toHaveBeenCalledWith(expect.objectContaining({ limit: 100 }));
  });

  it('필터 옵션을 그대로 전달한다', async () => {
    const repo = makeRepo();
    const useCase = new GetShopsUseCase(repo);
    await useCase.execute({ region: '강남', hasEvent: true });
    expect(repo.findMany).toHaveBeenCalledWith(expect.objectContaining({ region: '강남', hasEvent: true }));
  });
});
