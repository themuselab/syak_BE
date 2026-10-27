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

  async execute(events: SlotEvent[], todayOnly = true): Promise<{ dispatched: number }> {
    const today = new Date().toISOString().slice(0, 10);
    const filtered = todayOnly
      ? events.filter(e => e.slotDate === today)
      : events;

    // 같은 샵의 새 빈자리는 한 알림으로 묶는다. 예전엔 시간마다 따로 보내서 수집이 돌 때
    // "10시·11시·12시" 알림이 동시에 여러 개 왔다(사용자 제보 2026-10-27).
    const byShop = new Map<string, { event: SlotEvent; times: string[] }>();
    for (const e of filtered) {
      const g = byShop.get(e.shopId);
      if (g) {
        if (!g.times.includes(e.slotTime)) g.times.push(e.slotTime);
      } else {
        byShop.set(e.shopId, { event: e, times: [e.slotTime] });
      }
    }

    let dispatched = 0;

    for (const { event, times } of byShop.values()) {
      times.sort();
      const [first] = times;
      const extra = times.length - 1;
      // 알림 목록 제목: "{샵} {slotTime} 빈자리 알림!" → "모아래쉬 10:00 외 2개 빈자리 알림!"
      const slotLabel = extra > 0 ? `${first} 외 ${extra}개` : first;
      const shown = times.slice(0, 3).join(' · ');
      const body = times.length > 3
        ? `오늘 ${shown} 외 ${times.length - 3}개 예약 가능`
        : `오늘 ${shown} 예약 가능`;

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
        // 알림 row는 push 성공 여부와 무관하게 항상 저장
        try {
          await this.notifRepo.insert({
            userId: target.userId,
            shopId: event.shopId,
            shopName: event.shopName,
            type: target.type,
            slotTime: slotLabel,
            slotDate: event.slotDate,
          });
          dispatched++;
        } catch (insertErr) {
          logger.warn({ insertErr, userId: target.userId }, 'Notification insert failed — skipping push');
          continue;
        }

        // push는 별도 try/catch — 실패해도 알림 목록에는 남음
        try {
          await this.pushService.send(target.fcmToken, {
            title: `${event.shopName}에 빈자리가 생겼어요!`,
            body,
            data: { shopId: event.shopId, slotDate: event.slotDate, slotTime: first },
          });
        } catch (pushErr) {
          logger.warn({ pushErr, userId: target.userId, shopId: event.shopId }, 'Push send failed (notification saved)');
        }
      }
    }

    return { dispatched };
  }
}
