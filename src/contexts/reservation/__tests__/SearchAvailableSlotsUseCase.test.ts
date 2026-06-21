import { SearchAvailableSlotsUseCase } from '../application/SearchAvailableSlotsUseCase';
import { ISlotRepository } from '../ports/ISlotRepository';
import { AppError } from '../../../shared/errors/AppError';
import { ErrorCode } from '../../../shared/errors/ErrorCode';

function makeRepo(overrides: Partial<ISlotRepository> = {}): ISlotRepository {
  return {
    findByShop: jest.fn(),
    search: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe('SearchAvailableSlotsUseCase', () => {
  it('날짜와 시간을 제공하면 검색 결과를 반환한다', async () => {
    const useCase = new SearchAvailableSlotsUseCase(makeRepo());
    const result = await useCase.execute({ dates: ['2025-01-01'], times: ['14:00'] });
    expect(result).toEqual([]);
  });

  it('dates가 비어있으면 VALIDATION_ERROR를 던진다', async () => {
    const useCase = new SearchAvailableSlotsUseCase(makeRepo());
    await expect(useCase.execute({ dates: [], times: ['14:00'] }))
      .rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
  });

  it('times가 비어있으면 VALIDATION_ERROR를 던진다', async () => {
    const useCase = new SearchAvailableSlotsUseCase(makeRepo());
    await expect(useCase.execute({ dates: ['2025-01-01'], times: [] }))
      .rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
  });
});
