import { CreateOwnerSlotUseCase } from './CreateOwnerSlotUseCase';
import {
  IOwnerSlotRepository, IShopInfoProvider, ISlotNotifier, IOwnerActivityLog,
} from '../ports/IOwnerSlotRepository';
import { CreateSlotDto, OwnerSlot } from '../domain/OwnerSlot';
import { logger } from '../../../shared/logger';

/**
 * 빈자리 등록 + (옵션) 취소석 알림 발송.
 * 슬롯 생성은 항상 성공시키고, 알림 발송 실패(Supabase 정지·푸시 실패 등)는
 * 슬롯 생성을 롤백하지 않는다 — 상태만 waiting으로 남는다.
 */
export class RegisterAndNotifyUseCase {
  constructor(
    private readonly createUC: CreateOwnerSlotUseCase,
    private readonly repo: IOwnerSlotRepository,
    private readonly shopInfo: IShopInfoProvider,
    private readonly notifier: ISlotNotifier,
    private readonly activity: IOwnerActivityLog,
  ) {}

  async execute(shopId: string, ownerId: string, dto: CreateSlotDto, notify = true): Promise<OwnerSlot> {
    const slot = await this.createUC.execute(shopId, ownerId, dto);
    if (!notify) return slot;

    try {
      const shop = await this.shopInfo.getBasic(shopId);
      const { dispatched } = await this.notifier.dispatch({
        shopId,
        shopName: shop?.name ?? '내 매장',
        shopLat: shop?.lat ?? null,
        shopLng: shop?.lng ?? null,
        slotDate: slot.date,
        slotTime: slot.startTime,
      });
      const updated = await this.repo.markNotified(slot.id, dispatched);
      await this.activity.logDispatched({
        ownerId, shopId, slotId: slot.id, recipients: dispatched,
        slotTime: slot.startTime, serviceItems: slot.serviceItems,
      });
      return updated;
    } catch (err) {
      logger.warn({ err, slotId: slot.id }, 'owner slot 알림 발송 실패 — 슬롯은 waiting으로 유지');
      return slot;
    }
  }
}
