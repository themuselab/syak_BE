import { Pool } from 'pg';

/**
 * 스크래퍼용 내부 샵 오퍼레이션 (RDS). Supabase 이전에 따라 스크래퍼가
 * 백엔드 internal 엔드포인트로 타깃 로드/메타/요약/today_open을 처리.
 */
export class ShopSyncService {
  constructor(private readonly rds: Pool) {}

  /** 스크래핑 대상 (biz_id 있는 샵) */
  async getTargets(): Promise<Record<string, unknown>[]> {
    const { rows } = await this.rds.query(
      `SELECT id, biz_id, item_id, biz_type, item_ids, items
       FROM shops WHERE biz_id IS NOT NULL ORDER BY id`,
    );
    return rows;
  }

  /** 알림용 샵 메타 (name/lat/lng) */
  async getMeta(ids: string[]): Promise<Record<string, unknown>[]> {
    if (!ids.length) return [];
    const { rows } = await this.rds.query(
      `SELECT id, name, lat, lng FROM shops WHERE id = ANY($1::text[])`, [ids],
    );
    return rows;
  }

  /** slot_summary 업서트 (샵별 JSON) */
  async updateSummaries(rows: { id: string; slot_summary: unknown }[]): Promise<number> {
    let n = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const batch = rows.slice(i, i + 500);
      const values: string[] = [];
      const params: unknown[] = [];
      batch.forEach((r, j) => {
        values.push(`($${j * 2 + 1}, $${j * 2 + 2}::jsonb)`);
        params.push(r.id, JSON.stringify(r.slot_summary ?? []));
      });
      // id → slot_summary 매핑 UPDATE (존재하는 샵만)
      await this.rds.query(
        `UPDATE shops s SET slot_summary = v.ss
         FROM (VALUES ${values.join(',')}) AS v(id, ss)
         WHERE s.id = v.id`,
        params,
      );
      n += batch.length;
    }
    return n;
  }

  /** RDS 슬롯 기준으로 today_open 재계산(전 샵). date/after 이후 열린 샵만 true */
  async reconcileTodayOpen(date: string, after: string): Promise<{ open: number; changed: number }> {
    const at = /^\d{2}:\d{2}(:\d{2})?$/.test(after) ? (after.length === 5 ? `${after}:00` : after) : '00:00:00';
    const { rows } = await this.rds.query(
      `WITH open AS (
         SELECT DISTINCT shop_id FROM slots
         WHERE date = $1::date AND start_time >= $2::time
           AND source IN ('scraper','owner') AND (status IS NULL OR status NOT IN ('reserved','expired'))
       ),
       upd AS (
         UPDATE shops s
         SET today_open = (s.id IN (SELECT shop_id FROM open))
         WHERE s.today_open IS DISTINCT FROM (s.id IN (SELECT shop_id FROM open))
         RETURNING 1
       )
       SELECT (SELECT count(*) FROM open)::int AS open, (SELECT count(*) FROM upd)::int AS changed`,
      [date, at],
    );
    return { open: rows[0].open, changed: rows[0].changed };
  }
}
