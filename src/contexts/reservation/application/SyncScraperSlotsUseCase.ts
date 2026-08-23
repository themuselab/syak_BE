import { ISlotRepository } from '../ports/ISlotRepository';
import { Slot } from '../domain/Slot';
import { Errors } from '../../../shared/errors/AppError';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 스크래퍼 → RDS 슬롯 동기화 (날짜창 교체). 오늘 신규 슬롯 반환(알림용). */
export class SyncScraperSlotsUseCase {
  constructor(private readonly repo: ISlotRepository) {}

  async execute(input: {
    startDate: string; endDate: string; shopIds: string[]; slots: Slot[];
  }): Promise<{ inserted: number; newSlots: Slot[] }> {
    if (!DATE_RE.test(input.startDate) || !DATE_RE.test(input.endDate)) {
      throw Errors.validation({ date: 'startDate/endDate 형식은 YYYY-MM-DD' });
    }
    return this.repo.syncScraperWindow(input.startDate, input.endDate, input.shopIds ?? [], input.slots ?? []);
  }
}
