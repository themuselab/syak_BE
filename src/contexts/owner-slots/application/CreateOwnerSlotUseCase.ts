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
    if (dto.endTime && !TIME_RE.test(dto.endTime)) {
      throw Errors.validation({ endTime: '종료 시간 형식이 올바르지 않습니다 (HH:mm)' });
    }
    if (dto.endTime && dto.endTime <= dto.startTime) {
      throw Errors.validation({ endTime: '종료 시간은 시작 시간보다 늦어야 합니다' });
    }
    const serviceItems = (dto.serviceItems ?? []).map(s => s.trim()).filter(Boolean).slice(0, 12);
    return this.repo.create(shopId, ownerId, { ...dto, serviceItems });
  }
}
