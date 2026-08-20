import { Pool } from 'pg';
import {
  IOwnerDashboardRepository, DashboardCore, OwnerProfile, OwnerNotif,
} from '../ports/IOwnerDashboardRepository';
import { IOwnerActivityLog } from '../../owner-slots/ports/IOwnerSlotRepository';

const KST = "AT TIME ZONE 'Asia/Seoul'";
const num = (v: unknown) => Number(v ?? 0) || 0;

/** RDS — 사장님 대시보드 집계 + 활동 알림 + 프로필. IOwnerActivityLog도 겸한다. */
export class PgOwnerDashboardRepository implements IOwnerDashboardRepository, IOwnerActivityLog {
  constructor(private readonly pool: Pool) {}

  /** 지난 슬롯을 expired로 확정하고 만료 알림을 1건씩 생성 */
  async reconcileExpired(shopId: string, ownerId: string): Promise<void> {
    await this.pool.query(
      `WITH expired AS (
         UPDATE slots SET status = 'expired'
         WHERE shop_id = $1 AND source = 'owner' AND status IN ('waiting','notified')
           AND (date + COALESCE(end_time, start_time)) ${KST} < now()
         RETURNING id, to_char(start_time,'HH24:MI') AS st, service_items
       )
       INSERT INTO owner_notifications (owner_id, shop_id, kind, title, body, slot_id)
       SELECT $2, $1, 'expired', '빈자리 만료',
              e.st || ' ' || COALESCE(NULLIF(array_to_string(e.service_items, ', '), ''), '빈자리')
                 || ' 등록 건이 시간 만료됐어요',
              e.id
       FROM expired e
       ON CONFLICT (slot_id) WHERE kind = 'expired' DO NOTHING`,
      [shopId, ownerId],
    );
  }

  async getCore(shopId: string, ownerId: string): Promise<DashboardCore> {
    const [slotsAgg, favAgg, favRecent] = await Promise.all([
      this.pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE (created_at ${KST})::date = (now() ${KST})::date)                             AS today_registered,
           COALESCE(SUM(recipient_count) FILTER (WHERE (created_at ${KST})::date = (now() ${KST})::date), 0)     AS notif_today,
           COUNT(*) FILTER (WHERE status = 'reserved' AND (reserved_at ${KST}) >= date_trunc('week', now() ${KST}))                                       AS reserved_week,
           COUNT(*) FILTER (WHERE status = 'reserved' AND (reserved_at ${KST}) >= date_trunc('week', now() ${KST}) - interval '7 days'
                                                       AND (reserved_at ${KST}) <  date_trunc('week', now() ${KST}))                                      AS reserved_prev_week,
           COALESCE(SUM(reserved_amount) FILTER (WHERE status = 'reserved' AND (reserved_at ${KST}) >= date_trunc('week', now() ${KST})), 0)             AS revenue_week
         FROM slots WHERE shop_id = $1 AND source = 'owner'`,
        [shopId],
      ),
      this.pool.query(
        `SELECT
           COUNT(*)                                                                                    AS total,
           COUNT(*) FILTER (WHERE (created_at ${KST}) >= date_trunc('week', now() ${KST}))            AS week
         FROM favorites WHERE shop_id = $1`,
        [shopId],
      ),
      this.pool.query(
        `SELECT u.id, u.nickname, u.profile_image
         FROM favorites f JOIN users u ON u.id = f.user_id
         WHERE f.shop_id = $1 ORDER BY f.created_at DESC LIMIT 7`,
        [shopId],
      ),
    ]);

    void ownerId;
    const s = slotsAgg.rows[0];
    const f = favAgg.rows[0];
    return {
      todayRegistered:        num(s.today_registered),
      notificationsSentToday: num(s.notif_today),
      reservedCount:          num(s.reserved_week),
      reservedDeltaWeek:      num(s.reserved_week) - num(s.reserved_prev_week),
      recoveredRevenue:       num(s.revenue_week),
      favoritesCount:         num(f.total),
      favoritesDeltaWeek:     num(f.week),
      favoritesRecent: favRecent.rows.map(r => ({
        id: r.id as string,
        nickname: (r.nickname as string) ?? null,
        profileImage: (r.profile_image as string) ?? null,
      })),
    };
  }

  async listNotifications(ownerId: string): Promise<{ items: OwnerNotif[]; unread: number }> {
    const { rows } = await this.pool.query(
      `SELECT id, kind, title, body, read_at, created_at
       FROM owner_notifications WHERE owner_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [ownerId],
    );
    const items: OwnerNotif[] = rows.map(r => ({
      id: r.id as string,
      kind: r.kind as OwnerNotif['kind'],
      title: r.title as string,
      body: r.body as string,
      readAt: r.read_at ? (r.read_at as Date).toISOString() : null,
      createdAt: (r.created_at as Date).toISOString(),
    }));
    return { items, unread: items.filter(i => !i.readAt).length };
  }

  async markNotifRead(id: string, ownerId: string): Promise<void> {
    await this.pool.query(
      `UPDATE owner_notifications SET read_at = now() WHERE id = $1 AND owner_id = $2 AND read_at IS NULL`,
      [id, ownerId],
    );
  }

  async getProfile(ownerId: string): Promise<OwnerProfile | null> {
    const { rows } = await this.pool.query(
      `SELECT id, name, phone, email, nickname, profile_image FROM owner_accounts WHERE id = $1`,
      [ownerId],
    );
    return rows[0] ? this.mapProfile(rows[0]) : null;
  }

  async updateProfile(ownerId: string, patch: { name?: string; phone?: string; email?: string }): Promise<OwnerProfile> {
    const { rows } = await this.pool.query(
      `UPDATE owner_accounts SET
         name  = COALESCE($2, name),
         phone = COALESCE($3, phone),
         email = COALESCE($4, email)
       WHERE id = $1
       RETURNING id, name, phone, email, nickname, profile_image`,
      [ownerId, patch.name ?? null, patch.phone ?? null, patch.email ?? null],
    );
    return this.mapProfile(rows[0]);
  }

  // ── IOwnerActivityLog ──────────────────────────────────────────
  async logDispatched(i: { ownerId: string; shopId: string; slotId: number; recipients: number; slotTime: string; serviceItems: string[] }): Promise<void> {
    const items = i.serviceItems.filter(Boolean).join(', ') || '빈자리';
    await this.pool.query(
      `INSERT INTO owner_notifications (owner_id, shop_id, kind, title, body, slot_id)
       VALUES ($1, $2, 'dispatched', '취소석 알림 발송', $3, $4)`,
      [i.ownerId, i.shopId, `${i.slotTime} ${items} · 대기 고객 ${i.recipients}명에게 발송했어요`, i.slotId],
    );
  }

  async logReserved(i: { ownerId: string; shopId: string; slotId: number; customer: string | null; slotTime: string }): Promise<void> {
    await this.pool.query(
      `INSERT INTO owner_notifications (owner_id, shop_id, kind, title, body, slot_id)
       VALUES ($1, $2, 'reserved', '예약 확정', $3, $4)`,
      [i.ownerId, i.shopId, `${i.customer ?? '고객'}님이 ${i.slotTime} 예약했어요`, i.slotId],
    );
  }

  private mapProfile(r: Record<string, unknown>): OwnerProfile {
    return {
      id: r.id as string,
      name: (r.name as string) ?? null,
      phone: (r.phone as string) ?? null,
      email: (r.email as string) ?? null,
      nickname: (r.nickname as string) ?? null,
      profileImage: (r.profile_image as string) ?? null,
    };
  }
}
