import { Pool } from 'pg';
import { ISlotAlertRepository } from '../ports/ISlotAlertRepository';
import { SlotAlertMatch, SlotAlertRecord } from '../domain/SlotAlert';

export class PgSlotAlertRepository implements ISlotAlertRepository {
  constructor(private readonly pool: Pool) {}

  async shopExists(shopId: string): Promise<boolean> {
    const { rows } = await this.pool.query('SELECT 1 FROM shops WHERE id = $1 LIMIT 1', [shopId]);
    return rows.length > 0;
  }

  async createMany(userId: string, shopId: string, date: string, times: string[]): Promise<number> {
    if (times.length === 0) return 0;
    // 부분 유니크 인덱스(uq_slot_alerts_active)로 활성 신청 중복을 막는다.
    const { rowCount } = await this.pool.query(
      `INSERT INTO slot_alerts (user_id, shop_id, slot_date, slot_time)
       SELECT $1, $2, $3::date, t FROM unnest($4::text[]) AS t
       ON CONFLICT (user_id, shop_id, slot_date, slot_time) WHERE notified_at IS NULL
       DO NOTHING`,
      [userId, shopId, date, times],
    );
    return rowCount ?? 0;
  }

  async listRecentByUser(userId: string): Promise<SlotAlertRecord[]> {
    const { rows } = await this.pool.query(
      `SELECT a.id, a.user_id, a.shop_id,
              to_char(a.slot_date, 'YYYY-MM-DD') AS slot_date, a.slot_time,
              a.notified_at, a.created_at,
              s.name AS shop_name, s.gu AS shop_region,
              COALESCE(s.detail->'images'->'gallery'->>0, s.representative_image) AS shop_photo
       FROM slot_alerts a
       LEFT JOIN shops s ON s.id = a.shop_id
       WHERE a.user_id = $1
         AND (
           (a.notified_at IS NULL AND a.slot_date >= (now() AT TIME ZONE 'Asia/Seoul')::date - 7)
           OR a.notified_at >= now() - interval '7 days'
         )
       ORDER BY a.created_at DESC, a.slot_date ASC, a.slot_time ASC
       LIMIT 500`,
      [userId],
    );
    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      shopId: r.shop_id,
      shopName: r.shop_name ?? null,
      shopRegion: r.shop_region ?? null,
      shopPhoto: r.shop_photo ?? null,
      slotDate: r.slot_date,
      slotTime: r.slot_time,
      notifiedAt: r.notified_at ?? null,
      createdAt: r.created_at,
    }));
  }

  async deleteMany(userId: string, ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const { rowCount } = await this.pool.query(
      'DELETE FROM slot_alerts WHERE user_id = $1 AND id = ANY($2::uuid[])',
      [userId, ids],
    );
    return rowCount ?? 0;
  }

  async findActiveMatches(shopId: string, slots: Array<{ date: string; time: string }>): Promise<SlotAlertMatch[]> {
    if (slots.length === 0) return [];
    const { rows } = await this.pool.query(
      `SELECT a.id, a.user_id, to_char(a.slot_date, 'YYYY-MM-DD') AS slot_date, a.slot_time, ns.fcm_token
       FROM slot_alerts a
       JOIN unnest($2::date[], $3::text[]) AS e(d, t) ON a.slot_date = e.d AND a.slot_time = e.t
       LEFT JOIN notification_settings ns ON ns.user_id = a.user_id
       WHERE a.shop_id = $1 AND a.notified_at IS NULL`,
      [shopId, slots.map((s) => s.date), slots.map((s) => s.time)],
    );
    return rows.map((r) => ({
      alertId: r.id,
      userId: r.user_id,
      fcmToken: r.fcm_token ?? null,
      slotDate: r.slot_date,
      slotTime: r.slot_time,
    }));
  }

  async markNotified(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.pool.query(
      'UPDATE slot_alerts SET notified_at = now() WHERE id = ANY($1::uuid[]) AND notified_at IS NULL',
      [ids],
    );
  }
}
