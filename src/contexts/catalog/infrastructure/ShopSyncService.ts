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

  // ── 가격 동기화(price_sync) ──────────────────────────────────
  /** 가격 갱신 대상: detail 있는 샵, price_synced_at 오래된 순 */
  async getPriceTargets(limit: number): Promise<Record<string, unknown>[]> {
    const { rows } = await this.rds.query(
      `SELECT id, category FROM shops WHERE detail IS NOT NULL
       ORDER BY price_synced_at ASC NULLS FIRST LIMIT $1`, [Math.min(Math.max(limit, 1), 2000)],
    );
    return rows;
  }

  /** min_price/price_tier/price_synced_at 일괄 갱신 */
  async updatePrices(rows: { id: string; min_price: number | null; price_tier: string; price_synced_at?: string }[]): Promise<number> {
    let n = 0;
    for (const r of rows) {
      await this.rds.query(
        `UPDATE shops SET min_price=$2, price_tier=$3, price_synced_at=COALESCE($4, now()) WHERE id=$1`,
        [r.id, r.min_price ?? null, r.price_tier, r.price_synced_at ?? null],
      );
      n++;
    }
    return n;
  }

  // ── 파트너 동기화(sync_partners) ─────────────────────────────
  /** is_partner=true 이면서 아직 sync 안 된 샵 */
  async getPartnerUnsynced(limit: number): Promise<Record<string, unknown>[]> {
    const { rows } = await this.rds.query(
      `SELECT id, name, gu, category FROM shops
       WHERE is_partner = true AND partner_synced_at IS NULL LIMIT $1`, [Math.min(Math.max(limit, 1), 200)],
    );
    return rows;
  }

  /** 파트너 상세 enrich upsert (Playwright가 수집한 필드) */
  async enrichShop(r: Record<string, unknown>): Promise<void> {
    const gu = (r.gu as string) ?? (Array.isArray(r.gus) ? (r.gus as string[])[0] : null);
    const category = (r.category as string) ?? (Array.isArray(r.categories) ? (r.categories as string[])[0] : null);
    const categories = Array.isArray(r.categories) ? r.categories : (category ? [category] : []);
    await this.rds.query(
      `INSERT INTO shops (id, name, gu, category, categories, lat, lng, representative_image, review_count,
         price_tier, min_price, first_visit_deal, has_event, reservable, biz_id, item_id, detail,
         is_partner, partner_synced_at, updated_at)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,true,now(),now())
       ON CONFLICT (id) DO UPDATE SET
         name=COALESCE(EXCLUDED.name,shops.name), gu=COALESCE(EXCLUDED.gu,shops.gu),
         category=COALESCE(EXCLUDED.category,shops.category), categories=EXCLUDED.categories,
         lat=COALESCE(EXCLUDED.lat,shops.lat), lng=COALESCE(EXCLUDED.lng,shops.lng),
         representative_image=COALESCE(EXCLUDED.representative_image,shops.representative_image),
         review_count=EXCLUDED.review_count, price_tier=EXCLUDED.price_tier, min_price=EXCLUDED.min_price,
         first_visit_deal=EXCLUDED.first_visit_deal, has_event=EXCLUDED.has_event, reservable=EXCLUDED.reservable,
         biz_id=COALESCE(EXCLUDED.biz_id,shops.biz_id), item_id=COALESCE(EXCLUDED.item_id,shops.item_id),
         detail=EXCLUDED.detail, is_partner=true, partner_synced_at=now(), updated_at=now()`,
      [r.id, r.name ?? null, gu, category, JSON.stringify(categories),
       r.lat ?? null, r.lng ?? null, r.representative_image ?? null,
       (r.review_count as number) ?? 0, r.price_tier ?? '미정', r.min_price ?? null,
       (r.first_visit_deal as boolean) ?? false, (r.has_event as boolean) ?? false, (r.reservable as boolean) ?? false,
       r.biz_id ?? null, r.item_id ?? null, JSON.stringify(r.detail ?? {})],
    );
  }

  /** 지난 슬롯 정리(비용관리): 소비자에 안 보이는 과거 scraper 슬롯 삭제.
   *  owner 슬롯은 사장님 히스토리라 보존. 반환: 삭제 행 수. */
  async purgePastSlots(date: string): Promise<number> {
    const { rowCount } = await this.rds.query(
      `DELETE FROM slots WHERE source = 'scraper' AND date < $1::date`, [date],
    );
    return rowCount ?? 0;
  }

  /** RDS 슬롯 기준으로 today_open 재계산(전 샵). date/after 이후 열린 샵만 true */
  async reconcileTodayOpen(date: string, after: string): Promise<{ open: number; changed: number; purged: number }> {
    const purged = await this.purgePastSlots(date); // 매 실행마다 과거 scraper 슬롯 정리
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
    return { open: rows[0].open, changed: rows[0].changed, purged };
  }
}
