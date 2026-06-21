import { Pool } from 'pg';
import { IShopRepository, ShopListResult } from '../ports/IShopRepository';
import { Shop, ShopSummary, Category, PriceTier } from '../domain/Shop';
import { ShopFilter, SortOrder } from '../domain/ShopFilter';
import { ICacheService } from '../../../shared/cache/ICacheService';

// Supabase 실제 컬럼: gu, representative_image, detail(JSONB), category(단일), categories(JSONB배열)
// 도메인 모델: district, photos[], phone, bookingUrl, region

const SUMMARY_COLS = `
  id, name,
  '서울'::text                                         AS region,
  gu                                                   AS district,
  min_price, price_tier, categories,
  today_open, slot_summary, event_desc, event_price, is_partner,
  lat, lng,
  CASE
    WHEN representative_image IS NOT NULL
    THEN to_jsonb(ARRAY[representative_image])
    ELSE '[]'::jsonb
  END                                                  AS photos
`.trim();

const FULL_COLS = `
  ${SUMMARY_COLS},
  biz_id,
  review_count,
  (detail -> 'reservationRoutes' -> 0 ->> 'value')    AS booking_url,
  (detail ->> 'phone')                                 AS phone
`.trim();

// 리스트 캐시: 5분 (스크래퍼 주기보다 짧게)
const LIST_TTL  = 300;
// 상세 캐시: 10분 (상세 정보는 더 안정적)
const DETAIL_TTL = 600;

function filterCacheKey(filter: ShopFilter): string {
  // 정렬된 키로 안정적 문자열 생성
  const stable = JSON.stringify(filter, Object.keys(filter).sort());
  return `shops:list:${stable}`;
}

export class PgShopRepository implements IShopRepository {
  constructor(
    private readonly pool: Pool,
    private readonly cache: ICacheService,
  ) {}

  async findMany(filter: ShopFilter): Promise<ShopListResult> {
    const cacheKey = filterCacheKey(filter);
    const cached = await this.cache.get<ShopListResult>(cacheKey);
    if (cached) return cached;

    const { where, params } = this.buildWhere(filter);
    const order = this.buildOrder(filter.sort ?? 'default');
    const limit = filter.limit ?? 20;
    const offset = ((filter.page ?? 1) - 1) * limit;

    const countQ = await this.pool.query(
      `SELECT COUNT(*) FROM shops${where}`,
      params,
    );
    const total = parseInt(countQ.rows[0].count, 10);

    const { rows } = await this.pool.query(
      `SELECT ${SUMMARY_COLS}
       FROM shops${where}
       ${order}
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );

    const result: ShopListResult = {
      items: rows.map(this.mapSummary),
      total,
      page: filter.page ?? 1,
      limit,
    };

    await this.cache.set(cacheKey, result, LIST_TTL);
    return result;
  }

  async findById(id: string): Promise<Shop | null> {
    const cacheKey = `shops:detail:${id}`;
    const cached = await this.cache.get<Shop>(cacheKey);
    if (cached) return cached;

    const { rows } = await this.pool.query(
      `SELECT ${FULL_COLS} FROM shops WHERE id = $1`,
      [id],
    );
    const shop = rows[0] ? this.mapFull(rows[0]) : null;

    if (shop) await this.cache.set(cacheKey, shop, DETAIL_TTL);
    return shop;
  }

  private buildWhere(filter: ShopFilter): { where: string; params: unknown[] } {
    const conditions: string[] = [];
    const params: unknown[] = [];
    const p = () => `$${params.length}`;

    if (filter.categories?.length) {
      // Supabase의 `category` (단일 텍스트) = 샵의 대표 업종
      // 대표 업종 기준으로 필터링해야 price_tier가 해당 업종 가격을 의미함
      // 예) categories=['헤어'] + priceTiers=['2만원대'] → 헤어컷/펌이 2만원대인 곳
      params.push(filter.categories);
      conditions.push(`category = ANY(${p()})`);
    }

    if (filter.priceTiers?.length) {
      // categories 없이 priceTiers만 쓰면 price_tier 그대로 필터
      // categories와 함께 쓰면 대표 업종 서비스 가격 기준으로 정확히 동작
      params.push(filter.priceTiers);
      conditions.push(`price_tier = ANY(${p()})`);
    }

    if (filter.hasEvent) { conditions.push(`event_desc IS NOT NULL`); }
    if (filter.hasSlot)  { conditions.push(`today_open = true`); }

    if (filter.districts?.length) {
      params.push(filter.districts);
      conditions.push(`gu = ANY(${p()})`);
    }

    const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
    return { where, params };
  }

  private buildOrder(sort: SortOrder): string {
    if (sort === 'price_asc') return 'ORDER BY min_price ASC NULLS LAST';
    if (sort === 'partner')   return 'ORDER BY is_partner DESC, name ASC';
    return 'ORDER BY today_open DESC, is_partner DESC, name ASC';
  }

  private mapSummary(row: Record<string, unknown>): ShopSummary {
    return {
      id:          row.id as string,
      name:        row.name as string,
      region:      row.region as string | null,
      district:    row.district as string | null,
      minPrice:    row.min_price as number | null,
      priceTier:   row.price_tier as PriceTier | null,
      categories:  (row.categories as Category[]) ?? [],
      todayOpen:   row.today_open as boolean,
      slotSummary: (row.slot_summary as ShopSummary['slotSummary']) ?? [],
      eventDesc:   row.event_desc as string | null,
      eventPrice:  row.event_price as string | null,
      isPartner:   row.is_partner as boolean,
      lat:         row.lat as number | null,
      lng:         row.lng as number | null,
      photos:      (row.photos as string[]) ?? [],
    };
  }

  private mapFull(row: Record<string, unknown>): Shop {
    return {
      ...this.mapSummary(row),
      bizId:       row.biz_id as string | null,
      reviewCount: (row.review_count as number) ?? 0,
      bookingUrl:  row.booking_url as string | null,
      phone:       row.phone as string | null,
    };
  }
}
