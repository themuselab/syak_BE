import { IOwnerSlotRepository } from '../ports/IOwnerSlotRepository';
import { CreateSlotDto, OwnerSlot } from '../domain/OwnerSlot';
import { Errors } from '../../../shared/errors/AppError';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export class CreateOwnerSlotUseCase {
  constructor(private readonly repo: IOwnerSlotRepository) {}

  async execute(shopId: string, ownerId: string, dto: CreateSlotDto): Promise<OwnerSlot> {
    if (!dto.date || !DATE_RE.test(dto.date)) {
      throw Errors.validation({ date: '날짜 형식이 올바르지 않습니다 (YYYY-MM-DD)' });
    }
    if (!dto.startTime || !TIME_RE.test(dto.startTime)) {
      throw Errors.validation({ startTime: '시간 형식이 올바르지 않습니다 (HH:mm)' });
    }
    return this.repo.create(shopId, ownerId, dto);
  }
}
