import { Pool } from 'pg';
import { ICacheService } from '../../../shared/cache/ICacheService';

export type RefreshKind = 'slots' | 'events' | 'details';
export class PartnerRefreshService {
  constructor(private readonly pool: Pool, private readonly cache: ICacheService) {}

  async targets(kind: RefreshKind, after: string): Promise<Record<string, unknown>[]> {
    let cursor = { at: '', id: after };
    if (after.startsWith('v1:')) {
      try { cursor = JSON.parse(Buffer.from(after.slice(3), 'base64url').toString()); }
      catch { throw new Error('Invalid refresh cursor'); }
      if (typeof cursor.at !== 'string' || typeof cursor.id !== 'string') throw new Error('Invalid refresh cursor');
    }
    const { rows } = await this.pool.query(
      `SELECT id, name, gu, category, categories, biz_id, item_id, biz_type, item_ids, items,
              detail->'_partnerRefresh' AS refresh
       FROM shops WHERE is_partner = true
         AND (COALESCE(detail->'_partnerRefresh'->>$3,''),id) > ($1,$2)
       ORDER BY COALESCE(detail->'_partnerRefresh'->>$3,''),id LIMIT 50`, [cursor.at, cursor.id, kind],
    );
    const interval = { slots: 180_000, events: 1_800_000, details: 21_600_000 }[kind];
    return rows.map(r => { const at = Date.parse(r.refresh?.[kind] ?? ''); return { ...r, due: !Number.isFinite(at) || Date.now() - at >= interval }; });
  }

  async apply(id: string, kind: RefreshKind, observedAt: string, data: Record<string, any>): Promise<{ applied: boolean; newSlots: unknown[] }> {
    const observed = Date.parse(observedAt);
    if (!Number.isFinite(observed) || observed > Date.now() + 60_000 || observed < Date.now() - 3_600_000) throw new Error('Invalid observation time');
    const client = await this.pool.connect();
    let applied = false;
    const newSlots: unknown[] = [];
    try {
      await client.query('BEGIN');
      // Membership and source watermark are checked under the same row lock as replacement.
      const { rows } = await client.query('SELECT detail FROM shops WHERE id=$1 AND is_partner=true FOR UPDATE', [id]);
      const old = rows[0]?.detail ?? {};
      if (!rows.length || Date.parse(old._partnerRefresh?.[kind] ?? '') >= observed) {
        await client.query('ROLLBACK'); return { applied: false, newSlots: [] };
      }
      let patch: Record<string, unknown> = {};
      if (kind === 'slots') {
        const { startDate, endDate, slots, summary } = data;
        const start = Date.parse(startDate), end = Date.parse(endDate);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)
          || !Number.isFinite(start) || !Number.isFinite(end) || end < start || end - start > 2 * 86400_000
          || !Array.isArray(slots) || slots.length > 5000 || !Array.isArray(summary)) throw new Error('Invalid slot window');
        const unique = new Map<string, { date: string; startTime: string }>();
        for (const s of slots) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(s.date) || s.date < startDate || s.date > endDate || !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.startTime)) throw new Error('Invalid slot');
          unique.set(`${s.date}|${s.startTime}`, { date: s.date, startTime: s.startTime });
        }
        const { rows: previous } = await client.query(
          `SELECT to_char(date,'YYYY-MM-DD') AS d, to_char(start_time,'HH24:MI') AS t FROM slots
           WHERE shop_id=$1 AND source='scraper' AND date BETWEEN $2::date AND $3::date`, [id, startDate, endDate]);
        const keys = new Set(previous.map(r => `${r.d}|${r.t}`));
        const dates = new Set(previous.map(r => r.d));
        const clean = [...unique.values()];
        // Keep unchanged rows to avoid high-frequency DELETE/INSERT churn and WAL bloat.
        await client.query(`DELETE FROM slots s WHERE shop_id=$1 AND source='scraper' AND
          (date < $2::date OR (date BETWEEN $2::date AND $3::date AND NOT EXISTS (
            SELECT 1 FROM jsonb_to_recordset($4::jsonb) AS r(date text,"startTime" text)
            WHERE r.date::date=s.date AND r."startTime"::time=s.start_time)))`, [id, startDate, endDate, JSON.stringify(clean)]);
        const added = clean.filter(s => !keys.has(`${s.date}|${s.startTime}`));
        for (let i = 0; i < added.length; i += 500) {
          await client.query(`INSERT INTO slots(shop_id,date,start_time,source,status)
            SELECT $1, r.date::date, r."startTime"::time, 'scraper', 'waiting'
            FROM jsonb_to_recordset($2::jsonb) AS r(date text,"startTime" text)`, [id, JSON.stringify(added.slice(i, i + 500))]);
        }
        for (const slot of clean) {
          if (old._partnerRefresh?.slots && dates.has(slot.date) && !keys.has(`${slot.date}|${slot.startTime}`)) newSlots.push({ shopId: id, ...slot });
        }
        await client.query(`UPDATE shops SET slot_summary=$2::jsonb, today_open=EXISTS(
          SELECT 1 FROM slots WHERE shop_id=$1 AND date=(now() AT TIME ZONE 'Asia/Seoul')::date
          AND start_time>(now() AT TIME ZONE 'Asia/Seoul')::time AND source IN ('scraper','owner')
          AND (status IS NULL OR status NOT IN ('reserved','expired'))) WHERE id=$1`, [id, JSON.stringify(summary.slice(0, 6))]);
      } else if (kind === 'events') {
        if (data.event_desc !== null && typeof data.event_desc !== 'string') throw new Error('Invalid event');
        await client.query('UPDATE shops SET event_desc=$2, event_price=$3, has_event=$4 WHERE id=$1',
          [id, data.event_desc?.slice(0, 160) ?? null, data.event_price?.slice(0, 80) ?? null, !!data.event_desc]);
      } else {
        if (!data.detail || typeof data.detail !== 'object' || Array.isArray(data.detail)) throw new Error('Invalid detail');
        if (typeof data.lat === 'number' && typeof data.lng === 'number' && Number.isFinite(data.lat) && Number.isFinite(data.lng)
          && Math.abs(data.lat) <= 90 && Math.abs(data.lng) <= 180) {
          await client.query('UPDATE shops SET lat=$2,lng=$3 WHERE id=$1', [id, data.lat, data.lng]);
        }
        patch = { ...data.detail };
        delete patch._partnerRefresh;
        if (Array.isArray(patch.reviews)) patch.reviews = patch.reviews.slice(0, 15);
        if (patch.images && typeof patch.images === 'object') {
          const images = patch.images as Record<string, unknown>;
          patch.images = { ...(old.images ?? {}), ...Object.fromEntries(Object.entries(images).map(([key, value]) => [key, Array.isArray(value) ? [...new Set(value)].slice(0, key === 'review' ? 30 : 12) : value])) };
        }
        await client.query(`UPDATE shops SET name=COALESCE($2,name), representative_image=COALESCE($3,representative_image),
          review_count=COALESCE($4,review_count), min_price=COALESCE($5,min_price), price_tier=COALESCE($6,price_tier),
          biz_id=COALESCE($7,biz_id), item_id=COALESCE($8,item_id), biz_type=COALESCE($9,biz_type),
          item_ids=COALESCE($10::jsonb,item_ids), items=COALESCE($11::jsonb,items),
          partner_synced_at=now() WHERE id=$1`, [id, data.name ?? null, data.representative_image ?? null,
          data.review_count ?? null, data.min_price ?? null, data.price_tier ?? null,
          data.biz_id ?? null, data.item_id ?? null, data.biz_type ?? null,
          Array.isArray(data.item_ids) && data.item_ids.length ? JSON.stringify([...new Set(data.item_ids)].slice(0, 200)) : null,
          Array.isArray(data.items) && data.items.length ? JSON.stringify(data.items.slice(0, 200)) : null]);
      }
      patch._partnerRefresh = { ...(old._partnerRefresh ?? {}), [kind]: new Date(observed).toISOString() };
      await client.query(`UPDATE shops SET detail=COALESCE(detail,'{}'::jsonb)||$2::jsonb, updated_at=now() WHERE id=$1`, [id, JSON.stringify(patch)]);
      await client.query('COMMIT'); applied = true;
    } catch (err) { await client.query('ROLLBACK'); throw err; }
    finally { client.release(); }
    if (applied) {
      await this.cache.del(`shops:detail:${id}`);
      await this.cache.delPrefix?.('shops:list:');
      await this.cache.delPrefix?.('slots:');
    }
    return { applied, newSlots };
  }
}
