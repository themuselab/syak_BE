import { INotificationRepository } from '../ports/INotificationRepository';
import { IPushService } from '../ports/IPushService';
import { logger } from '../../../shared/logger';

export interface SlotEvent {
  shopId: string;
  shopName: string;
  shopLat: number | null;
  shopLng: number | null;
  slotDate: string;
  slotTime: string;
}

export class DispatchSlotNotificationsUseCase {
  constructor(
    private readonly notifRepo: INotificationRepository,
    private readonly pushService: IPushService,
  ) {}

  async execute(events: SlotEvent[]): Promise<{ dispatched: number }> {
    let dispatched = 0;

    for (const event of events) {
      const [favoriteTargets, nearTargets] = await Promise.all([
        this.notifRepo.findFavoriteTargets(event.shopId),
        event.shopLat && event.shopLng
          ? this.notifRepo.findNearbyTargets(event.shopLat, event.shopLng)
          : Promise.resolve([]),
      ]);

      const seen = new Set<string>();
      const allTargets = [...favoriteTargets, ...nearTargets].filter((t) => {
        if (seen.has(t.userId)) return false;
        seen.add(t.userId);
        return true;
      });

      for (const target of allTargets) {
        try {
          await this.pushService.send(target.fcmToken, {
            title: `${event.shopName}에 빈자리가 생겼어요!`,
            body: `오늘 ${event.slotTime} 예약 가능`,
            data: { shopId: event.shopId, slotDate: event.slotDate, slotTime: event.slotTime },
          });
          await this.notifRepo.insert({
            userId: target.userId,
            shopId: event.shopId,
            shopName: event.shopName,
            type: target.type,
            slotTime: event.slotTime,
            slotDate: event.slotDate,
          });
          dispatched++;
        } catch (err) {
          logger.warn({ err, userId: target.userId, shopId: event.shopId }, 'Push dispatch failed');
        }
      }
    }

    return { dispatched };
  }
}
