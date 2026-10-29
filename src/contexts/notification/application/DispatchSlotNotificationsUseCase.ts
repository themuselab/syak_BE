import { INotificationRepository } from '../ports/INotificationRepository';
import { IPushService } from '../ports/IPushService';
import { ISlotAlertRepository } from '../ports/ISlotAlertRepository';
import { NotificationType } from '../domain/Notification';
import { dayLabel, kstNow } from '../domain/SlotAlert';
import { logger } from '../../../shared/logger';

export interface SlotEvent {
  shopId: string;
  shopName: string;
  shopLat: number | null;
  shopLng: number | null;
  slotDate: string;
  slotTime: string;
}

interface Slot { date: string; time: string }

interface Recipient {
  userId: string;
  fcmToken: string | null;
  type: NotificationType;
  /** 빈자리 알림 신청으로 매칭된 슬롯 — 있으면 신청 문구로 보낸다 */
  alertSlots: Slot[];
  alertIds: string[];
}

const MAX_SHOWN = 3;

/** "오늘 10:00 · 11:00 · 내일 09:00 외 2개" */
function formatSlots(slots: Slot[], today: string): string {
  const parts = slots.slice(0, MAX_SHOWN).map((s, i) =>
    i === 0 || slots[i - 1].date !== s.date ? `${dayLabel(s.date, today)} ${s.time}` : s.time);
  const rest = slots.length - MAX_SHOWN;
  return parts.join(' · ') + (rest > 0 ? ` 외 ${rest}개` : '');
}

function sortSlots(slots: Slot[]): Slot[] {
  return [...slots].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

export class DispatchSlotNotificationsUseCase {
  constructor(
    private readonly notifRepo: INotificationRepository,
    private readonly pushService: IPushService,
    private readonly slotAlertRepo?: ISlotAlertRepository,
  ) {}

  /**
   * @param todayOnly 즐겨찾기/관심동네 알림을 '오늘(KST)' 슬롯으로 제한(스크래퍼 호출 기본값).
   *   빈자리 알림 신청 매칭은 이 값과 무관하게 모든 이벤트 날짜에 적용한다(신청은 오늘~모레).
   */
  async execute(events: SlotEvent[], todayOnly = true): Promise<{ dispatched: number }> {
    const today = kstNow().date;

    // 같은 샵의 새 빈자리는 한 알림으로 묶는다. 예전엔 시간마다 따로 보내서 수집이 돌 때
    // "10시·11시·12시" 알림이 동시에 여러 개 왔다(사용자 제보 2026-10-27).
    const byShop = new Map<string, { event: SlotEvent; slots: Slot[] }>();
    for (const e of events) {
      const slot = { date: e.slotDate, time: String(e.slotTime).slice(0, 5) };
      const g = byShop.get(e.shopId);
      if (g) {
        if (!g.slots.some((s) => s.date === slot.date && s.time === slot.time)) g.slots.push(slot);
      } else {
        byShop.set(e.shopId, { event: e, slots: [slot] });
      }
    }

    let dispatched = 0;

    for (const { event, slots: rawSlots } of byShop.values()) {
      const slots = sortSlots(rawSlots);
      const generalSlots = todayOnly ? slots.filter((s) => s.date === today) : slots;

      const [favoriteTargets, nearTargets, alertMatches] = await Promise.all([
        generalSlots.length > 0 ? this.notifRepo.findFavoriteTargets(event.shopId) : Promise.resolve([]),
        generalSlots.length > 0 && event.shopLat && event.shopLng
          ? this.notifRepo.findNearbyTargets(event.shopLat, event.shopLng)
          : Promise.resolve([]),
        this.slotAlertRepo
          ? this.slotAlertRepo.findActiveMatches(event.shopId, slots).catch((err) => {
              logger.warn({ err, shopId: event.shopId }, 'Slot alert lookup failed — continuing without');
              return [];
            })
          : Promise.resolve([]),
      ]);

      // 유저 단위로 합친다 — 즐겨찾기+주변+신청이 겹쳐도 샵당 푸시 1번
      const recipients = new Map<string, Recipient>();
      for (const t of [...favoriteTargets, ...nearTargets]) {
        if (!recipients.has(t.userId)) {
          recipients.set(t.userId, { userId: t.userId, fcmToken: t.fcmToken, type: t.type, alertSlots: [], alertIds: [] });
        }
      }
      for (const m of alertMatches) {
        let r = recipients.get(m.userId);
        if (!r) {
          r = { userId: m.userId, fcmToken: m.fcmToken, type: 'alert', alertSlots: [], alertIds: [] };
          recipients.set(m.userId, r);
        }
        r.type = 'alert';
        r.fcmToken = r.fcmToken ?? m.fcmToken;
        r.alertIds.push(m.alertId);
        if (!r.alertSlots.some((s) => s.date === m.slotDate && s.time === m.slotTime)) {
          r.alertSlots.push({ date: m.slotDate, time: m.slotTime });
        }
      }

      const notifiedAlertIds: string[] = [];

      for (const r of recipients.values()) {
        const isAlert = r.alertIds.length > 0;
        const shown = isAlert ? sortSlots(r.alertSlots) : generalSlots;
        const [first] = shown;
        const extra = shown.length - 1;
        // 알림 목록 제목: "{샵} {slotTime} 빈자리 알림!" → "모아래쉬 10:00 외 2개 빈자리 알림!"
        const slotLabel = extra > 0 ? `${first.time} 외 ${extra}개` : first.time;
        const body = isAlert
          ? `신청하신 ${formatSlots(shown, today)} 자리가 났어요`
          : `${formatSlots(shown, today)} 예약 가능`;

        // 알림 row는 push 성공 여부와 무관하게 항상 저장
        let saved = false;
        try {
          await this.notifRepo.insert({
            userId: r.userId,
            shopId: event.shopId,
            shopName: event.shopName,
            type: r.type,
            slotTime: slotLabel,
            slotDate: first.date,
          });
          saved = true;
          dispatched++;
        } catch (insertErr) {
          logger.warn({ insertErr, userId: r.userId }, 'Notification insert failed');
        }
        // 기존 즐겨찾기/주변 알림은 저장 실패 시 푸시도 건너뛴다(기존 동작 유지).
        // 신청 알림은 사용자가 직접 요청한 것이라 저장이 실패해도 푸시는 보낸다.
        if (!saved && !isAlert) continue;

        // push는 별도 try/catch — 실패해도 알림 목록에는 남음
        if (r.fcmToken) {
          try {
            await this.pushService.send(r.fcmToken, {
              title: `${event.shopName}에 빈자리가 생겼어요!`,
              body,
              data: { shopId: event.shopId, slotDate: first.date, slotTime: first.time },
            });
          } catch (pushErr) {
            logger.warn({ pushErr, userId: r.userId, shopId: event.shopId }, 'Push send failed (notification saved)');
          }
        }
        // 알림 1번 받으면 그 신청은 종료(푸시 시도 여부·성공과 무관)
        notifiedAlertIds.push(...r.alertIds);
      }

      if (this.slotAlertRepo && notifiedAlertIds.length > 0) {
        try {
          await this.slotAlertRepo.markNotified(notifiedAlertIds);
        } catch (err) {
          logger.error({ err, shopId: event.shopId, count: notifiedAlertIds.length }, 'Slot alert markNotified failed');
        }
      }
    }

    return { dispatched };
  }
}
