import { ISlotAlertRepository } from '../ports/ISlotAlertRepository';
import { SlotAlertView, addDays, isSlotPast, kstNow, toSlotAlertView } from '../domain/SlotAlert';
import { Errors } from '../../../shared/errors/AppError';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TIMES = 48;
const MAX_DELETE_IDS = 500;

export interface CreateSlotAlertsInput {
  shopId?: unknown;
  date?: unknown;
  times?: unknown;
}

/** POST /notifications/slot-alerts */
export class CreateSlotAlertsUseCase {
  constructor(private readonly repo: ISlotAlertRepository, private readonly now: () => Date = () => new Date()) {}

  async execute(userId: string, input: CreateSlotAlertsInput): Promise<{ created: number }> {
    const { shopId, date, times } = input ?? {};
    const errors: Record<string, string> = {};

    if (typeof shopId !== 'string' || shopId.trim() === '') errors.shopId = 'shopId가 필요합니다';

    const today = kstNow(this.now()).date;
    if (typeof date !== 'string' || !DATE_RE.test(date)) {
      errors.date = 'date는 YYYY-MM-DD 형식이어야 합니다';
    } else if (date < today || date > addDays(today, 2)) {
      errors.date = '오늘부터 모레까지만 신청할 수 있습니다';
    }

    if (!Array.isArray(times) || times.length < 1 || times.length > MAX_TIMES) {
      errors.times = `times는 1~${MAX_TIMES}개의 배열이어야 합니다`;
    } else if (!times.every((t) => typeof t === 'string' && TIME_RE.test(t) && validClock(t))) {
      errors.times = 'times는 HH:MM 형식이어야 합니다';
    }

    if (Object.keys(errors).length > 0) throw Errors.validation(errors);

    const sid = (shopId as string).trim();
    if (!(await this.repo.shopExists(sid))) throw Errors.shopNotFound({ shopId: sid });

    // 중복 제거 + 이미 지난 시간(오늘)은 만들지 않는다 — 만들어도 즉시 '만료'라 의미 없음
    const now = this.now();
    const uniq = [...new Set(times as string[])].filter((t) => !isSlotPast(date as string, t, now)).sort();
    const created = await this.repo.createMany(userId, sid, date as string, uniq);
    return { created };
  }
}

function validClock(t: string): boolean {
  const [h, m] = t.split(':').map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

/** GET /notifications/slot-alerts */
export class ListSlotAlertsUseCase {
  constructor(private readonly repo: ISlotAlertRepository, private readonly now: () => Date = () => new Date()) {}

  async execute(userId: string): Promise<{ alerts: SlotAlertView[] }> {
    const rows = await this.repo.listRecentByUser(userId);
    const now = this.now();
    return { alerts: rows.map((r) => toSlotAlertView(r, now)) };
  }
}

/** DELETE /notifications/slot-alerts — 본인 것만 */
export class DeleteSlotAlertsUseCase {
  constructor(private readonly repo: ISlotAlertRepository) {}

  async execute(userId: string, ids: unknown): Promise<void> {
    if (!Array.isArray(ids) || ids.length > MAX_DELETE_IDS
        || !ids.every((id) => typeof id === 'string' && UUID_RE.test(id))) {
      throw Errors.validation({ ids: `ids는 신청 ID(uuid) 배열이어야 합니다(최대 ${MAX_DELETE_IDS}개)` });
    }
    if (ids.length === 0) return;
    await this.repo.deleteMany(userId, [...new Set(ids as string[])]);
  }
}
