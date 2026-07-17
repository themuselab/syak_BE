import type { SupabaseClient } from '@supabase/supabase-js';
import { IShopRepository, ShopListResult } from '../ports/IShopRepository';
import { Shop, ShopSummary, ShopMenu, ShopReview, Category, PriceTier, ReservationRoute } from '../domain/Shop';
import { ShopFilter, SortOrder } from '../domain/ShopFilter';
import { ICacheService } from '../../../shared/cache/ICacheService';

const LIST_TTL   = 300;
const DETAIL_TTL = 600;

const SUMMARY_SELECT =
  'id, name, gu, min_price, price_tier, categories, today_open, slot_summary, event_desc, event_price, is_partner, lat, lng, representative_image, review_count';
const FULL_SELECT =
  `${SUMMARY_SELECT}, biz_id, detail`;

function filterCacheKey(filter: ShopFilter): string {
  return `shops:list:${JSON.stringify(filter, Object.keys(filter).sort())}`;
}

export class PgShopRepository implements IShopRepository {
  constructor(
    private readonly sb: SupabaseClient,
    private readonly cache: ICacheService,
  ) {}

  async findMany(filter: ShopFilter): Promise<ShopListResult> {
    const cacheKey = filterCacheKey(filter);
    const cached = await this.cache.get<ShopListResult>(cacheKey);
    if (cached) return cached;

    // 슬롯 테이블 사전 조회 (slotDate 또는 availableWithinDays)
    let slotShopIds: string[] | null = null;
    if (filter.slotDate || filter.availableWithinDays) {
      let slotQ = this.sb.from('slots').select('shop_id');
      if (filter.slotDate) {
        slotQ = slotQ.eq('slot_date', filter.slotDate);
        if (filter.slotTime) slotQ = slotQ.eq('start_time', `${filter.slotTime}:00`);
      } else if (filter.availableWithinDays) {
        const today = new Date();
        const dates = Array.from({ length: filter.availableWithinDays }, (_, i) => {
          const d = new Date(today);
          d.setDate(d.getDate() + i);
          return d.toISOString().slice(0, 10);
        });
        slotQ = slotQ.in('slot_date', dates);
      }
      const { data: slotRows } = await slotQ;
      slotShopIds = [...new Set((slotRows ?? []).map((r: { shop_id: string }) => r.shop_id))];
      if (slotShopIds.length === 0) {
        return { items: [], total: 0, page: filter.page ?? 1, limit: filter.limit ?? 20 };
      }
    }

    const limit  = filter.limit ?? 20;
    const offset = ((filter.page ?? 1) - 1) * limit;

    let q = this.sb.from('shops').select(SUMMARY_SELECT, { count: 'exact' });

    // categories는 jsonb 배열 — cs(@>)로 포함 여부 확인, 복수 카테고리는 OR
    if (filter.categories?.length) {
      if (filter.categories.length === 1) {
        q = q.filter('categories', 'cs', JSON.stringify([filter.categories[0]]));
      } else {
        const orClause = filter.categories
          .map(c => `categories.cs.${JSON.stringify([c])}`)
          .join(',');
        q = q.or(orClause);
      }
    }
    if (filter.priceTiers?.length) q = q.in('price_tier', filter.priceTiers);
    if (filter.hasEvent)           q = q.not('event_desc', 'is', null);
    if (filter.hasSlot)            q = q.eq('today_open', true);
    if (filter.districts?.length)  q = q.in('gu', filter.districts);
    if (filter.q)                  q = q.ilike('name', `%${filter.q}%`);
    if (slotShopIds)               q = q.in('id', slotShopIds);

    // 위치 기반 bounding box 필터
    if (filter.lat != null && filter.lng != null) {
      const r = filter.radius ?? 5;
      const latDelta = r / 111;
      const lngDelta = r / (111 * Math.cos((filter.lat * Math.PI) / 180));
      q = q
        .gte('lat', filter.lat - latDelta)
        .lte('lat', filter.lat + latDelta)
        .gte('lng', filter.lng - lngDelta)
        .lte('lng', filter.lng + lngDelta);
    }

    const sort: SortOrder = filter.sort ?? 'default';
    if (sort === 'price_asc') {
      q = q.order('min_price', { ascending: true, nullsFirst: false });
    } else if (sort === 'price_desc') {
      q = q.order('min_price', { ascending: false, nullsFirst: false });
    } else if (sort === 'partner') {
      q = q.order('is_partner', { ascending: false }).order('name', { ascending: true });
    } else {
      q = q.order('today_open', { ascending: false })
           .order('is_partner', { ascending: false })
           .order('name',       { ascending: true });
    }

    const { data, count, error } = await q.range(offset, offset + limit - 1);
    if (error) throw error;

    const result: ShopListResult = {
      items: (data ?? []).map(r => this.mapSummary(r as Record<string, unknown>)),
      total: count ?? 0,
      page:  filter.page ?? 1,
      limit,
    };

    await this.cache.set(cacheKey, result, LIST_TTL);
    return result;
  }

  async findById(id: string): Promise<Shop | null> {
    const cacheKey = `shops:detail:${id}`;
    const cached = await this.cache.get<Shop>(cacheKey);
    if (cached) return cached;

    const { data, error } = await this.sb
      .from('shops')
      .select(FULL_SELECT)
      .eq('id', id)
      .single();

    if (error || !data) return null;

    const shop = this.mapFull(data as Record<string, unknown>);
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
      photos:      row.representative_image
                     ? [row.representative_image as string]
                     : [],
    };
  }

  private mapFull(row: Record<string, unknown>): Shop {
    const detail  = row.detail as Record<string, unknown> | null;
    const rawRoutes = (detail?.reservationRoutes as Array<{ type?: string; label?: string; value?: string }> | null) ?? [];
    const imgs    = detail?.images as Record<string, unknown> | null;

    // 예약/문의 수단 — type이 정확히 저장돼 있다(naver=실제예약, talktalk/instagram/kakao=문의, phone=전화)
    const reservationRoutes = rawRoutes
      .filter((r) => r?.value)
      .map((r) => ({ type: (r.type ?? 'phone') as ReservationRoute['type'], label: r.label ?? '', value: r.value as string }));
    // 대표 예약 링크: 진짜 예약(naver)을 최우선, 없으면 첫 항목
    const primary = reservationRoutes.find((r) => r.type === 'naver') ?? reservationRoutes[0] ?? null;

    // 갤러리 우선, 없으면 리뷰 이미지, 없으면 대표 이미지 1장
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
