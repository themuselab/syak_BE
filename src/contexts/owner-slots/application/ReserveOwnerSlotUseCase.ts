import { IOwnerSlotRepository, IOwnerActivityLog } from '../ports/IOwnerSlotRepository';
import { OwnerSlot } from '../domain/OwnerSlot';
import { Errors } from '../../../shared/errors/AppError';

/** 사장님이 '예약 성사'로 표시 — 예약 전환/회수 매출 집계의 원천 */
export class ReserveOwnerSlotUseCase {
  constructor(
    private readonly repo: IOwnerSlotRepository,
    private readonly activity: IOwnerActivityLog,
  ) {}

  async execute(
    slotId: number, shopId: string, ownerId: string,
    input: { amount?: number | null; customer?: string | null },
  ): Promise<OwnerSlot> {
    const slot = await this.repo.findById(slotId);
    if (!slot) throw Errors.slotNotFound();
    if (slot.shopId !== shopId) throw Errors.slotForbidden();

    const amount = input.amount == null ? null : Math.max(0, Math.round(input.amount));
    const customer = input.customer?.trim() || null;
    const updated = await this.repo.reserve(slotId, amount, customer);

    await this.activity.logReserved({
      ownerId, shopId, slotId, customer, slotTime: slot.startTime,
    }).catch(() => { /* 알림 로깅 실패는 무시 */ });

    return updated;
  }
}
