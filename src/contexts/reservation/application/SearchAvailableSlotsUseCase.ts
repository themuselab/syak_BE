import { ISlotRepository } from '../ports/ISlotRepository';
import { ShopWithSlots, SlotSearchQuery } from '../domain/Slot';
import { Errors } from '../../../shared/errors/AppError';

export class SearchAvailableSlotsUseCase {
  constructor(private readonly slotRepo: ISlotRepository) {}

  async execute(query: SlotSearchQuery): Promise<ShopWithSlots[]> {
    if (!query.dates.length) throw Errors.validation({ dates: '날짜를 하나 이상 선택해 주세요' });
    if (!query.times.length) throw Errors.validation({ times: '시간을 하나 이상 선택해 주세요' });
    return this.slotRepo.search(query);
  }
}
