import { GetShopSlotsUseCase } from '../application/GetShopSlotsUseCase';
import { ISlotRepository } from '../ports/ISlotRepository';
import { Slot } from '../domain/Slot';

const mockSlots: Slot[] = [
  { shopId: 'shop-1', date: '2025-01-01', startTime: '14:00' },
];

function makeRepo(): ISlotRepository {
  return {
    findByShop: jest.fn().mockResolvedValue(mockSlots),
    search: jest.fn(),
  };
}

describe('GetShopSlotsUseCase', () => {
  it('특정 날짜를 넘기면 그 날짜로 조회한다', async () => {
    const repo = makeRepo();
    const useCase = new GetShopSlotsUseCase(repo);
    const result = await useCase.execute('shop-1', ['2025-01-01']);
    expect(repo.findByShop).toHaveBeenCalledWith('shop-1', ['2025-01-01']);
    expect(result).toBe(mockSlots);
  });

  it('날짜를 넘기지 않으면 앞으로 3일치를 자동으로 설정한다', async () => {
    const repo = makeRepo();
    const useCase = new GetShopSlotsUseCase(repo);
    await useCase.execute('shop-1');
    const call = (repo.findByShop as jest.Mock).mock.calls[0];
    expect(call[1]).toHaveLength(3);
  });
});
