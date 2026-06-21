import { IOwnerSlotRepository } from '../ports/IOwnerSlotRepository';
import { CreateSlotDto, OwnerSlot } from '../domain/OwnerSlot';
import { Errors } from '../../../shared/errors/AppError';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export class UpdateOwnerSlotUseCase {
  constructor(private readonly repo: IOwnerSlotRepository) {}

  async execute(slotId: number, shopId: string, dto: Partial<CreateSlotDto>): Promise<OwnerSlot> {
    const slot = await this.repo.findById(slotId);
    if (!slot) throw Errors.slotNotFound();
    if (slot.shopId !== shopId) throw Errors.slotForbidden();

    if (dto.date && !DATE_RE.test(dto.date)) {
      throw Errors.validation({ date: '날짜 형식이 올바르지 않습니다 (YYYY-MM-DD)' });
    }
    if (dto.startTime && !TIME_RE.test(dto.startTime)) {
      throw Errors.validation({ startTime: '시간 형식이 올바르지 않습니다 (HH:mm)' });
    }
    return this.repo.update(slotId, dto);
  }
}
