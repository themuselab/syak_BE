import { Pool } from 'pg';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ISlotRepository } from '../ports/ISlotRepository';
import { Slot, SlotSearchQuery, ShopWithSlots } from '../domain/Slot';
import { ICacheService } from '../../../shared/cache/ICacheService';

/**
 * 슬롯은 RDS의 slots 테이블에서 읽는다 (Supabase egress 회피).
 * 스크래퍼 슬롯(source='scraper')과 사장님 빈자리(source='owner')를 함께 노출.
 * 샵 이름/구는 아직 Supabase(shops) — 짧은 캐시로 완화.
 */
const AVAILABLE = "status IS NULL OR status NOT IN ('reserved','expired')";
const SHOP_TTL = 90;    // 샵 슬롯
const SEARCH_TTL = 60;  // 검색 결과

export class PgSlotRepository implements ISlotRepository {
  constructor(
    private readonly rds: Pool,
    private readonly sb: SupabaseClient,
    private readonly cache: ICacheService,
  ) {}

  async findByShop(shopId: string, dates: string[]): Promise<Slot[]> {
    if (!dates.length) return [];
    const key = `slots:shop:${shopId}:${[...dates].sort().join(',')}`;
    const cached = await this.cache.get<Slot[]>(key);
    if (cached) return cached;

    const { rows } = await this.rds.query(
      `SELECT date::text AS date, to_char(start_time, 'HH24:MI') AS start_time
       FROM slots
       WHERE shop_id = $1 AND date = ANY($2::date[])
         AND source IN ('scraper','owner') AND (${AVAILABLE})
       ORDER BY date, start_time`,
      [shopId, dates],
    );
    const slots: Slot[] = rows.map(r => ({ shopId, date: r.date as string, startTime: r.start_time as string }));
    await this.cache.set(key, slots, SHOP_TTL);
    return slots;
  }

  async search(query: SlotSearchQuery): Promise<ShopWithSlots[]> {
    const times = [...new Set(query.times.map(t => {
      const [h, m] = t.split(':');
      return `${h.padStart(2, '0')}:${(m ?? '00').padStart(2, '0')}`;
    }))];
    const districts = query.districts?.length ? [...query.districts].sort() : null;
    const key = `slots:search:${[...query.dates].sort().join(',')}|${[...times].sort().join(',')}|${districts?.join(',') ?? ''}`;
    const cached = await this.cache.get<ShopWithSlots[]>(key);
    if (cached) return cached;

    // 1) RDS에서 날짜+시간 매칭 슬롯 (전 샵). start_time은 TIME 비교로 인덱스 활용
    const dbTimes = times.map(t => `${t}:00`); // 'HH:MM' → 'HH:MM:00'
    const { rows: slotRows } = await this.rds.query(
      `SELECT shop_id, date::text AS date, to_char(start_time, 'HH24:MI') AS start_time
       FROM slots
       WHERE date = ANY($1::date[])
         AND start_time = ANY($2::time[])
         AND source IN ('scraper','owner') AND (${AVAILABLE})`,
      [query.dates, dbTimes],
    );
    if (!slotRows.length) { await this.cache.set(key, [], SEARCH_TTL); return []; }

    // 2) 매칭 샵의 이름/구 (Supabase — 소량, 캐시됨)
    const shopIds = [...new Set(slotRows.map(r => r.shop_id as string))];
    const shopMap = await this.fetchShops(shopIds, districts);

    const grouped = new Map<string, ShopWithSlots>();
    for (const row of slotRows) {
      const sid = row.shop_id as string;
      const shop = shopMap.get(sid);
      if (!shop) continue; // 구 필터로 제외됐거나 샵 정보 없음
      if (!grouped.has(sid)) {
        grouped.set(sid, { shopId: sid, shopName: shop.name, district: shop.gu, availableSlots: [] });
      }
      grouped.get(sid)!.availableSlots.push({ date: row.date as string, time: row.start_time as string });
    }
    const result = [...grouped.values()];
    await this.cache.set(key, result, SEARCH_TTL);
    return result;
  }

  /** 샵 이름/구 조회 (Supabase) — 5분 캐시로 egress 최소화 */
  private async fetchShops(shopIds: string[], districts: string[] | null): Promise<Map<string, { name: string; gu: string | null }>> {
    const key = `shops:meta:${[...shopIds].sort().join(',')}`;
    let all = await this.cache.get<{ id: string; name: string; gu: string | null }[]>(key);
    if (!all) {
      const { data, error } = await this.sb.from('shops').select('id, name, gu').in('id', shopIds);
      if (error) throw error;
      all = (data ?? []) as { id: string; name: string; gu: string | null }[];
      await this.cache.set(key, all, 300);
    }
    const map = new Map<string, { name: string; gu: string | null }>();
    for (const s of all) {
      if (districts && !districts.includes(s.gu ?? '')) continue;
      map.set(s.id, { name: s.name, gu: s.gu });
    }
    return map;
  }

  /** 지금(date, after 이후) 열려있는 샵 id (초록핀 재계산용) */
  async openNowShopIds(date: string, after: string): Promise<string[]> {
    const at = /^\d{2}:\d{2}(:\d{2})?$/.test(after) ? (after.length === 5 ? `${after}:00` : after) : '00:00:00';
    const { rows } = await this.rds.query(
      `SELECT DISTINCT shop_id FROM slots
       WHERE date = $1::date AND start_time >= $2::time
         AND source IN ('scraper','owner') AND (${AVAILABLE})`,
      [date, at],
    );
    return rows.map(r => r.shop_id as string);
  }

  /**
   * 스크래퍼 동기화: 날짜창의 scraper 슬롯을 비우고 새로 채운다.
   * 새로 생긴(오늘) 슬롯 목록을 반환 → 스크래퍼가 알림 발송에 사용.
   */
  async syncScraperWindow(
    startDate: string, endDate: string, shopIds: string[], slots: Slot[],
  ): Promise<{ inserted: number; newSlots: Slot[] }> {
    const client = await this.rds.connect();
    try {
      await client.query('BEGIN');
      const todayKst = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

      // 오늘 기존 슬롯(신규 판별용)
      const { rows: existing } = await client.query(
        `SELECT shop_id, to_char(start_time,'HH24:MI') AS t
         FROM slots WHERE source='scraper' AND date=$1 AND shop_id = ANY($2::text[])`,
        [todayKst, shopIds.length ? shopIds : ['']],
      );
      const existingSet = new Set(existing.map(r => `${r.shop_id}|${r.t}`));
      const existingShops = new Set(existing.map(r => r.shop_id as string)); // 오늘 기존 슬롯이 있던 샵

      // 창 비우기 (해당 샵)
      if (shopIds.length) {
        await client.query(
          `DELETE FROM slots WHERE source='scraper' AND date BETWEEN $1 AND $2 AND shop_id = ANY($3::text[])`,
          [startDate, endDate, shopIds],
        );
      }

      // payload 중복 제거 후 벌크 삽입
      const seen = new Set<string>();
      const clean = slots.filter(s => {
        const k = `${s.shopId}|${s.date}|${s.startTime}`;
        if (seen.has(k)) return false; seen.add(k); return true;
      });
      let inserted = 0;
      for (let i = 0; i < clean.length; i += 500) {
        const batch = clean.slice(i, i + 500);
        const vals: string[] = [];
        const params: unknown[] = [];
        batch.forEach((s, j) => {
          const b = j * 3;
          vals.push(`($${b + 1}, $${b + 2}, $${b + 3}, 'scraper', 'waiting')`);
          params.push(s.shopId, s.date, `${s.startTime}:00`);
        });
        await client.query(
          `INSERT INTO slots (shop_id, date, start_time, source, status) VALUES ${vals.join(',')}`,
          params,
        );
        inserted += batch.length;
      }

      // 과거 정리 (작음)
      await client.query(`DELETE FROM slots WHERE source='scraper' AND date < $1`, [startDate]);

      await client.query('COMMIT');

      // 신규 = 오늘 슬롯 중, 그 샵이 오늘 기존 슬롯을 갖고 있었고(초기적재 제외) 없던 시간대
      const newSlots = clean.filter(s =>
        s.date === todayKst && existingShops.has(s.shopId) && !existingSet.has(`${s.shopId}|${s.startTime}`),
      );
      return { inserted, newSlots };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
