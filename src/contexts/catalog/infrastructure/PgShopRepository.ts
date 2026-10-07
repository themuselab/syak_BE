import { Pool } from 'pg';
import { IShopRepository, ShopListResult } from '../ports/IShopRepository';
import { Shop, ShopSummary, ShopMenu, ShopReview, Category, PriceTier, ReservationRoute } from '../domain/Shop';
import { ShopFilter, SortOrder } from '../domain/ShopFilter';
import { ICacheService } from '../../../shared/cache/ICacheService';

const LIST_TTL   = 300;
const DETAIL_TTL = 600;

// 목록도 포트폴리오(갤러리) 썸네일과 한 줄 소개를 쓴다 — detail jsonb에서 필요한 두 키만 뽑는다.
// detail 전체를 내리면 목록 60건에 메뉴·리뷰까지 실려 응답이 수십 배로 커진다.
const SUMMARY_COLS =
  "id, name, gu, min_price, price_tier, categories, today_open, slot_summary, event_desc, event_price, is_partner, lat, lng, representative_image, review_count, detail->>'introduction' AS introduction, detail->'images'->'gallery' AS gallery";

// 목록 카드에 가로로 늘어놓는 작업 사진 수. 더 보려면 상세로 들어간다.
const LIST_GALLERY_LIMIT = 3;
const FULL_COLS = `${SUMMARY_COLS}, biz_id, detail`;

function filterCacheKey(filter: ShopFilter): string {
  return `shops:list:${JSON.stringify(filter, Object.keys(filter).sort())}`;
}

/** RDS(pg) 기반 샵 리포지토리 — Supabase에서 이전. jsonb는 node-pg가 JS로 파싱. */
export class PgShopRepository implements IShopRepository {
  constructor(
    private readonly rds: Pool,
    private readonly cache: ICacheService,
  ) {}

  async findMany(filter: ShopFilter): Promise<ShopListResult> {
    if (filter.lat != null && filter.lng != null) {
      filter = { ...filter, lat: Math.round(filter.lat * 100) / 100, lng: Math.round(filter.lng * 100) / 100 };
    }
    const cacheKey = filterCacheKey(filter);
    const cached = await this.cache.get<ShopListResult>(cacheKey);
    if (cached) return cached;

    // 슬롯 사전 조회 (RDS slots — scraper/owner 통합)
    let slotShopIds: string[] | null = null;
    if (filter.slotDate || filter.availableWithinDays) {
      const p: unknown[] = [];
      let where = "source IN ('scraper','owner') AND (status IS NULL OR status NOT IN ('reserved','expired'))";
      if (filter.slotDate) {
        p.push(filter.slotDate); where += ` AND date = $${p.length}::date`;
        if (filter.slotTime) { p.push(`${filter.slotTime}:00`); where += ` AND start_time = $${p.length}::time`; }
      } else if (filter.availableWithinDays) {
        const today = new Date();
        const dates = Array.from({ length: filter.availableWithinDays }, (_, i) => {
          const d = new Date(today); d.setDate(d.getDate() + i); return d.toISOString().slice(0, 10);
        });
        p.push(dates); where += ` AND date = ANY($${p.length}::date[])`;
      }
      const { rows } = await this.rds.query(`SELECT DISTINCT shop_id FROM slots WHERE ${where}`, p);
      slotShopIds = rows.map(r => r.shop_id as string);
      if (slotShopIds.length === 0) {
        return { items: [], total: 0, page: filter.page ?? 1, limit: filter.limit ?? 20 };
      }
    }

    const limit  = filter.limit ?? 20;
    const offset = ((filter.page ?? 1) - 1) * limit;

    const cond: string[] = [];
    const params: unknown[] = [];
    const add = (v: unknown) => { params.push(v); return `$${params.length}`; };

    if (filter.categories?.length) {
      const ors = filter.categories.map(c => `categories @> ${add(JSON.stringify([c]))}::jsonb`);
      cond.push(`(${ors.join(' OR ')})`);
    }
    if (filter.priceTiers?.length) cond.push(`price_tier = ANY(${add(filter.priceTiers)}::text[])`);
    if (filter.hasEvent)           cond.push(`event_desc IS NOT NULL`);
    if (filter.hasSlot)            cond.push(`today_open = true`);
    if (filter.districts?.length)  cond.push(`gu = ANY(${add(filter.districts)}::text[])`);
    if (filter.q) {
      // q = 지역 검색 전용("천호" → 천호동 샵들). 상호 검색은 뺐다 — 앱 검색창이 "지도검색"이라
      // 지역만 찾는다. 구는 gu 컬럼, 동/도로명은 detail.roadAddress. 둘 중 하나만 맞으면 된다.
      // (이 엔드포인트의 유일한 소비자는 앱이다. 웹은 /web/shops/search를 따로 쓴다.)
      const like = add(`%${filter.q}%`);
      cond.push(`(gu ILIKE ${like} OR detail->>'roadAddress' ILIKE ${like})`);
    }
    if (slotShopIds)               cond.push(`id = ANY(${add(slotShopIds)}::text[])`);

    const hasBounds =
      filter.swLat != null && filter.swLng != null && filter.neLat != null && filter.neLng != null;
    if (hasBounds) {
      // 지도 화면영역 박스(웹/앱 지도뷰: 보이는 영역 = 목록·핀 일치). 정렬은 아래 lat/lng(중심) 거리순.
      // BETWEEN은 low..high 순서여야 하므로 클라가 뒤집어 보내도 min/max로 정규화(방어 — 빈 결과 방지).
      const swLat = Math.min(filter.swLat!, filter.neLat!);
      const neLat = Math.max(filter.swLat!, filter.neLat!);
      const swLng = Math.min(filter.swLng!, filter.neLng!);
      const neLng = Math.max(filter.swLng!, filter.neLng!);
      cond.push(`lat BETWEEN ${add(swLat)} AND ${add(neLat)}`);
      cond.push(`lng BETWEEN ${add(swLng)} AND ${add(neLng)}`);
    } else if (filter.lat != null && filter.lng != null) {
      const r = filter.radius ?? 5;
      const latDelta = r / 111;
      const lngDelta = r / (111 * Math.cos((filter.lat * Math.PI) / 180));
      cond.push(`lat BETWEEN ${add(filter.lat - latDelta)} AND ${add(filter.lat + latDelta)}`);
      cond.push(`lng BETWEEN ${add(filter.lng - lngDelta)} AND ${add(filter.lng + lngDelta)}`);
    }

    const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';

    const sort: SortOrder = filter.sort ?? 'default';
    const hasGeo = filter.lat != null && filter.lng != null;
    let orderBy: string;
    if (sort === 'price_asc')       orderBy = 'min_price ASC NULLS LAST';
    else if (sort === 'price_desc') orderBy = 'min_price DESC NULLS LAST';
    else if (sort === 'partner')    orderBy = 'is_partner DESC, name ASC';
    else if (hasGeo) {
      // 위치가 있으면 기본 정렬 = "가까운순"(거리 오름차순). 경도는 위도 코사인으로 보정한 근사거리.
      // (반경 5km 박스 안 정렬용이라 제곱유클리드로 충분 — 동률은 파트너/이름으로 안정화)
      const latP = add(filter.lat);
      const lngP = add(filter.lng);
      const latP2 = add(filter.lat);
      orderBy = `(POWER(lat - ${latP}, 2) + POWER((lng - ${lngP}) * COS(RADIANS(${latP2})), 2)) ASC, is_partner DESC, name ASC`;
    }
    else                            orderBy = 'today_open DESC, is_partner DESC, name ASC';

    const limitPh = add(limit);
    const offsetPh = add(offset);
    const { rows } = await this.rds.query(
      `SELECT ${SUMMARY_COLS}, COUNT(*) OVER() AS total_count
       FROM shops ${where}
       ORDER BY ${orderBy}
       LIMIT ${limitPh} OFFSET ${offsetPh}`,
      params,
    );

    const total = rows.length ? Number(rows[0].total_count) : 0;
    const result: ShopListResult = {
      items: rows.map(r => this.mapSummary(r as Record<string, unknown>)),
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

    const { rows } = await this.rds.query(`SELECT ${FULL_COLS} FROM shops WHERE id = $1`, [id]);
    if (!rows[0]) return null;

    const shop = this.mapFull(rows[0] as Record<string, unknown>);
    await this.cache.set(cacheKey, shop, DETAIL_TTL);
    return shop;
  }

  private mapSummary(row: Record<string, unknown>): ShopSummary {
    return {
      id:          row.id as string,
      name:        row.name as string,
      region:      null,
      district:    row.gu as string | null,
      minPrice:    row.min_price as number | null,
      priceTier:   row.price_tier as PriceTier | null,
      categories:  (row.categories as Category[]) ?? [],
      todayOpen:   (row.today_open as boolean) ?? false,
      slotSummary: (row.slot_summary as ShopSummary['slotSummary']) ?? [],
      eventDesc:   row.event_desc as string | null,
      eventPrice:  row.event_price as string | null,
      isPartner:   (row.is_partner as boolean) ?? false,
      lat:         row.lat as number | null,
      lng:         row.lng as number | null,
      reviewCount: (row.review_count as number) ?? 0,
      // 작업 사진이 있으면 그걸 쓰고(포트폴리오), 없을 때만 대표 이미지 1장으로 대체한다.
      photos:      this.listPhotos(row),
      introduction: (row.introduction as string | null) ?? null,
    };
  }

  /** 목록용 사진: 갤러리 앞 LIST_GALLERY_LIMIT장, 없으면 대표 이미지 1장. */
  private listPhotos(row: Record<string, unknown>): string[] {
    const gallery = (row.gallery as string[] | null) ?? [];
    if (gallery.length > 0) return gallery.slice(0, LIST_GALLERY_LIMIT);
    return row.representative_image ? [row.representative_image as string] : [];
  }

  private mapFull(row: Record<string, unknown>): Shop {
    const detail  = row.detail as Record<string, unknown> | null;
    const rawRoutes = (detail?.reservationRoutes as Array<{ type?: string; label?: string; value?: string }> | null) ?? [];
    const imgs    = detail?.images as Record<string, unknown> | null;

    const reservationRoutes = rawRoutes
      .filter((r) => r?.value)
      .map((r) => ({ type: (r.type ?? 'phone') as ReservationRoute['type'], label: r.label ?? '', value: r.value as string }));
    const primary = reservationRoutes.find((r) => r.type === 'naver') ?? reservationRoutes[0] ?? null;

    const gallery = (imgs?.gallery as string[] | null) ?? [];
    const photos  = gallery.length > 0
      ? gallery
      : (row.representative_image ? [row.representative_image as string] : []);

    const rawMenus   = (detail?.menus as Array<Record<string, unknown>> | null) ?? [];
    const rawReviews = (detail?.reviews as Array<Record<string, unknown>> | null) ?? [];

    return {
      ...this.mapSummary(row),
      photos,
      bizId:       row.biz_id as string | null,
      reservationRoutes,
      bookingUrl:  primary?.value ?? null,
      bookingType: primary?.type ?? null,
      phone:       (detail?.phone as string) ?? null,
      roadAddress: (detail?.roadAddress as string) ?? null,
      menus: rawMenus.map(m => ({
        name:      m.name as string,
        price:     m.price as number | null,
        recommend: (m.recommend as boolean) ?? false,
      } satisfies ShopMenu)),
      reviews: rawReviews.map(r => ({
        body:       r.body as string,
        images:     (r.images as string[]) ?? [],
        keywords:   (r.keywords as string[]) ?? [],
        ownerReply: (r.ownerReply as string | null) ?? null,
      } satisfies ShopReview)),
    };
  }
}
