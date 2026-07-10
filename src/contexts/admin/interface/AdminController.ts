import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { Pool } from 'pg';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Errors } from '../../../shared/errors/AppError';
import { initAdminSSE, AdminSSEService } from '../infrastructure/AdminSSEService';
import {
  generateMarketingImages as runImageGeneration, MARKETING_BUCKET, MarketingImage,
} from '../infrastructure/MarketingImageService';

function toCamel(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())] = v;
  }
  return out;
}
const mapRows = (rows: Record<string, unknown>[]) => rows.map(toCamel);

/** marketing_snapshots.data 중 서버가 직접 다루는 부분만 */
interface MarketingSnapshotData {
  instagram?: { aiAdvice?: string; aiFollowUp?: string };
  threads?:   { aiAdvice?: string; aiFollowUp?: string };
  images?:    MarketingImage[];
}

/** 여러 shopId에 대한 Supabase 샵 정보를 한 번에 가져오는 헬퍼 */
async function fetchShopMap(
  sb: SupabaseClient,
  shopIds: string[],
  cols = 'id, name, gu, category',
): Promise<Map<string, Record<string, unknown>>> {
  if (!shopIds.length) return new Map();
  const { data, error } = await sb.from('shops').select(cols).in('id', shopIds);
  if (error) console.error('[fetchShopMap] error', error.message, { shopIds: shopIds.slice(0, 3), cols });
  return new Map(((data ?? []) as unknown as Record<string, unknown>[]).map(s => [s.id as string, s]));
}

export class AdminController {
  public readonly sse: AdminSSEService;

  constructor(
    private readonly rds: Pool,
    private readonly sbClient: SupabaseClient,
  ) {
    this.sse = initAdminSSE(rds, sbClient);
  }

  // ── SSE 스트림 ───────────────────────────────────────────────
  stream = (req: Request, res: Response): void => {
    this.sse.addClient(res);
  };

  // ── 관리자 로그인 ─────────────────────────────────────────────
  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password } = req.body as { email?: string; password?: string };
      if (!email || !password) return next(Errors.validation({ email: '이메일과 비밀번호를 입력해주세요' }));
      if (email !== process.env.ADMIN_EMAIL || password !== process.env.ADMIN_PASSWORD) {
        return next(Errors.adminUnauthorized());
      }
      const sessionToken = process.env.ADMIN_SESSION_TOKEN ?? crypto.randomBytes(32).toString('hex');
      res.cookie('syak_admin', sessionToken, {
        httpOnly: true,
        secure: process.env.COOKIE_SECURE === 'true',
        sameSite: 'strict',
        maxAge: 8 * 60 * 60 * 1000,
      });
      res.json({ ok: true });
    } catch (err) { next(err); }
  };

  logout = (_req: Request, res: Response): void => {
    res.clearCookie('syak_admin');
    res.json({ ok: true });
  };

  // ── 사장님 계정 목록 ──────────────────────────────────────────
  listOwners = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { rows } = await this.rds.query(`
        SELECT id, nickname, profile_image, shop_id, created_at
        FROM owner_accounts ORDER BY created_at DESC LIMIT 200
      `);
      const shopIds = rows.map(o => o.shop_id).filter(Boolean) as string[];
      const shopMap = await fetchShopMap(this.sbClient, shopIds, 'id, name, gu');
      const owners = rows.map(o => ({
        id:           o.id,
        nickname:     o.nickname,
        profileImage: o.profile_image,
        shopId:       o.shop_id ?? null,
        shopName:     shopMap.get(o.shop_id)?.name ?? null,
        shopGu:       shopMap.get(o.shop_id)?.gu ?? null,
        createdAt:    o.created_at,
      }));
      res.json({ owners });
    } catch (err) { next(err); }
  };

  // ── 사장님 연동 해제 ──────────────────────────────────────────
  unlinkOwner = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.rds.query(`UPDATE owner_accounts SET shop_id = NULL WHERE id = $1`, [req.params.ownerId]);
      void this.sse.pushNow();
      res.json({ ok: true });
    } catch (err) { next(err); }
  };

  // ── 파트너 코드 발급 ──────────────────────────────────────────
  createPartnerCode = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { shopId } = req.body as { shopId?: string };
      if (!shopId) return next(Errors.validation({ shopId: 'shopId가 필요합니다' }));
      const code = await this._issueCode(shopId);
      void this.sse.pushNow();
      res.status(201).json(code);
    } catch (err) { next(err); }
  };

  // ── 네이버 플레이스 조회 (어드민 프록시) ─────────────────────
  naverPlaceSearch = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { placeId } = req.params;
      if (!/^\d+$/.test(placeId))
        return next(Errors.validation({ placeId: '숫자로만 된 네이버 플레이스 ID를 입력하세요' }));

      const url = `https://map.naver.com/v5/api/sites/summary/${placeId}?lang=ko`;
      const raw = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://map.naver.com/',
          'Accept': 'application/json, text/plain, */*',
        },
      });
      if (!raw.ok) throw new Error(`Naver API ${raw.status}`);

      const json = await raw.json() as Record<string, unknown>;
      const site = (json.site ?? json) as Record<string, unknown>;

      res.json({
        placeId,
        name:     String(site.name ?? ''),
        address:  String(site.roadAddress ?? site.address ?? ''),
        phone:    String(site.phone ?? ''),
        category: String(site.category ?? ''),
        imageUrl: String(site.imageUrl ?? site.thumUrl ?? ''),
        lat:      site.y ?? null,
        lng:      site.x ?? null,
      });
    } catch (err) { next(err); }
  };

  // ── 네이버 플레이스 기반 코드 발급 (샵 없으면 Supabase에 생성) ─
  createPartnerCodeFromNaver = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = req.body as {
        placeId?: string; name?: string; address?: string;
        phone?: string; category?: string; imageUrl?: string; gu?: string;
      };
      if (!body.name || !body.placeId)
        return next(Errors.validation({ name: 'name, placeId는 필수입니다' }));

      // Supabase에 플레이스 ID로 샵이 있는지 확인
      const { data: existing } = await this.sbClient
        .from('shops')
        .select('id')
        .eq('naver_place_id', body.placeId)
        .single();

      let shopId: string;
      if (existing) {
        shopId = (existing as { id: string }).id;
        // 정보 갱신
        await this.sbClient.from('shops').update({
          name: body.name,
          road_address: body.address,
          gu: body.gu,
          categories: body.category ? [body.category] : undefined,
          category: body.category,
          representative_image: body.imageUrl || undefined,
        }).eq('id', shopId);
      } else {
        // 새 샵 등록
        const { data: newShop, error } = await this.sbClient
          .from('shops')
          .insert({
            naver_place_id:       body.placeId,
            name:                 body.name,
            road_address:         body.address ?? '',
            gu:                   body.gu ?? '',
            category:             body.category ?? '',
            categories:           body.category ? [body.category] : [],
            representative_image: body.imageUrl || null,
            today_open:           false,
            is_partner:           false,
          })
          .select('id')
          .single();
        if (error) throw error;
        shopId = (newShop as { id: string }).id;
      }

      const code = await this._issueCode(shopId);
      void this.sse.pushNow();
      res.status(201).json({ ...code, shopId, shopName: body.name });
    } catch (err) { next(err); }
  };

  // ── 내부: 코드 생성 헬퍼 ─────────────────────────────────────
  private async _issueCode(shopId: string): Promise<{ code: string; expiresAt: string }> {
    const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    let attempts = 0;
    do {
      code = Array.from({ length: 6 }, () => CHARSET[Math.floor(Math.random() * CHARSET.length)]).join('');
      const { rows } = await this.rds.query(`SELECT 1 FROM partner_codes WHERE code = $1`, [code]);
      if (!rows.length) break;
    } while (++attempts < 10);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const { rows } = await this.rds.query(
      `INSERT INTO partner_codes (code, shop_id, expires_at) VALUES ($1, $2, $3) RETURNING code, expires_at`,
      [code, shopId, expiresAt],
    );
    return { code: rows[0].code as string, expiresAt: rows[0].expires_at as string };
  }

  // ── 파트너샵 목록 (Supabase is_partner=true 기준) ────────────
  listPartnerShops = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { data: shops, error } = await this.sbClient
        .from('shops')
        .select('id, name, gu, category, today_open, representative_image, partner_synced_at, pilot_coupon, detail->>phone')
        .eq('is_partner', true)
        .order('partner_synced_at', { ascending: false });
      if (error) throw error;

      const result = (shops ?? []).map(s => ({
        shopId:             s.id,
        name:               s.name,
        gu:                 s.gu,
        category:           s.category,
        todayOpen:          s.today_open ?? false,
        thumbnailUrl:       s.representative_image ?? null,
        partnerSyncedAt:    s.partner_synced_at ?? null,
        pilotCoupon:        s.pilot_coupon ?? null,
        phone:              s.phone ?? null,   // detail->>phone
        naverReservationUrl: null,
      }));
      res.json({ shops: result });
    } catch (err) { next(err); }
  };

  // ── 전체 샵: 필터 옵션(카테고리 · 시도>시군구) — 30분 메모리 캐시 ──
  private shopFilterCache: {
    at: number;
    categories: string[];
    gus: string[];
    guToSido: Record<string, string>;
    regions: Record<string, string[]>;
  } | null = null;

  /**
   * 시/도 파싱 어휘 (대한민국 광역자치단체 17개 — 고정 행정구역).
   * ⚠️ 지역 "목록"은 하드코딩하지 않는다. 시군구는 전부 DB(shops.gu)에서 나오고,
   *    시/도는 detail.roadAddress 앞부분을 이 어휘로 해석해 파생시킨다.
   */
  private static readonly SIDO = [
    '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
    '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주',
  ] as const;
  private static readonly ETC = '기타';

  /** '서울특별시', '경기도' 같은 정식명도 접두 매칭으로 흡수 */
  private static matchSido(token?: string | null): string | null {
    if (!token) return null;
    return AdminController.SIDO.find(s => token.startsWith(s)) ?? null;
  }

  /** gu 하나에 대해 시/도를 DB 샘플 주소로 파생 */
  private async resolveSidoForGu(gu: string): Promise<string> {
    // 1) gu 자체에 시/도 접두가 있으면 그대로 (예: "부산 금정구")
    const fromGu = AdminController.matchSido(gu.split(' ')[0]);
    if (fromGu && gu.includes(' ')) return fromGu;

    // 2) 해당 gu의 샘플 주소 몇 건을 읽어 첫 토큰에서 파생
    try {
      const { data } = await this.sbClient
        .from('shops')
        .select('detail->>roadAddress')
        .eq('gu', gu)
        .limit(5);
      for (const r of (data ?? []) as { roadAddress: string | null }[]) {
        const hit = AdminController.matchSido(r.roadAddress?.trim().split(/\s+/)[0]);
        if (hit) return hit;
      }
    } catch { /* 샘플 실패 시 아래 폴백 */ }

    return AdminController.ETC;
  }

  listShopFilters = async (_req: Request, res: Response): Promise<void> => {
    try {
      const TTL = 30 * 60 * 1000;
      if (this.shopFilterCache && Date.now() - this.shopFilterCache.at < TTL) {
        const c = this.shopFilterCache;
        res.json({ categories: c.categories, gus: c.gus, regions: c.regions });
        return;
      }

      // 1) 카테고리 · 시군구 수집 (가벼운 컬럼만, detail 미접근)
      const BATCH = 1000;
      const cats = new Set<string>();
      const gus  = new Set<string>();
      let offset = 0;
      while (true) {
        const { data, error } = await this.sbClient
          .from('shops')
          .select('category, gu')
          .range(offset, offset + BATCH - 1);
        if (error) throw error;
        for (const r of (data ?? []) as { category: string | null; gu: string | null }[]) {
          if (r.category) cats.add(r.category);
          if (r.gu) gus.add(r.gu);
        }
        if (!data || data.length < BATCH) break;
        offset += BATCH;
      }

      const guList = [...gus].sort((a, b) => a.localeCompare(b, 'ko'));

      // 2) gu → 시/도 파생 (병렬 8개씩)
      const guToSido: Record<string, string> = {};
      const CHUNK = 8;
      for (let i = 0; i < guList.length; i += CHUNK) {
        const slice = guList.slice(i, i + CHUNK);
        const sidos = await Promise.all(slice.map(g => this.resolveSidoForGu(g)));
        slice.forEach((g, idx) => { guToSido[g] = sidos[idx]; });
      }

      // 3) 시/도 → 시군구 트리
      const regions: Record<string, string[]> = {};
      for (const g of guList) {
        const s = guToSido[g] ?? AdminController.ETC;
        (regions[s] ??= []).push(g);
      }
      for (const s of Object.keys(regions)) regions[s].sort((a, b) => a.localeCompare(b, 'ko'));

      const categories = [...cats].sort((a, b) => a.localeCompare(b, 'ko'));
      this.shopFilterCache = { at: Date.now(), categories, gus: guList, guToSido, regions };
      res.json({ categories, gus: guList, regions });
    } catch (err) {
      console.error('[listShopFilters]', (err as Error).message);
      res.json({ categories: [], gus: [], regions: {} });
    }
  };

  /** sido만 선택했을 때 해당 시/도의 시군구 목록 (캐시 없으면 채움) */
  private async gusOfSido(sido: string): Promise<string[]> {
    if (!this.shopFilterCache || Date.now() - this.shopFilterCache.at > 30 * 60 * 1000) {
      await new Promise<void>(resolve => {
        this.listShopFilters({} as Request, { json: () => resolve() } as unknown as Response);
      });
    }
    return this.shopFilterCache?.regions[sido] ?? [];
  }

  // ── 전체 샵 현황 (검색 + 카테고리/지역 필터 + 서버 정렬) ──────
  listAllShops = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page     = parseInt(req.query.page as string ?? '1', 10);
      const search   = req.query.q as string | undefined;
      const category = req.query.category as string | undefined;
      const sido     = req.query.sido as string | undefined;
      const gu       = req.query.gu as string | undefined;
      const sortRaw  = req.query.sort as string | undefined;
      const sort     = ['name', 'category', 'gu'].includes(sortRaw ?? '') ? sortRaw! : 'name';
      const ascending = req.query.dir !== 'desc';
      const limit  = 50;
      const offset = (page - 1) * limit;

      // ⚠️ detail(JSONB)은 menus/reviews/images를 품은 대용량 컬럼이다.
      //    4만 행을 정렬하면서 detail->>phone 을 함께 뽑으면 statement timeout(57014) 발생.
      //    → 1단계: 가벼운 목록 조회 / 2단계: 그 페이지의 id에 대해서만 전화번호·주소 조회
      let q = this.sbClient
        .from('shops')
        .select('id, name, gu, category, today_open, representative_image, is_partner', { count: 'exact' });

      if (search)   q = q.ilike('name', `%${search}%`);
      if (category) q = q.eq('category', category);
      if (gu) {
        q = q.eq('gu', gu);                       // 시군구까지 선택
      } else if (sido) {
        const list = await this.gusOfSido(sido);  // 시/도만 선택 → 소속 시군구 전체
        if (!list.length) { res.json({ shops: [], total: 0, page, limit }); return; }
        q = q.in('gu', list);
      }
      q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

      const { data, count, error } = await q;
      if (error) throw error;

      const rows = (data ?? []) as { id: string; [k: string]: unknown }[];
      const ids = rows.map(r => r.id);

      const detailMap = new Map<string, { phone?: string | null; roadAddress?: string | null }>();
      if (ids.length) {
        const { data: det, error: detErr } = await this.sbClient
          .from('shops')
          .select('id, detail->>phone, detail->>roadAddress')
          .in('id', ids);
        if (detErr) console.error('[listAllShops detail]', detErr.message);
        for (const d of (det ?? []) as { id: string; phone: string | null; roadAddress: string | null }[]) {
          detailMap.set(d.id, { phone: d.phone, roadAddress: d.roadAddress });
        }
      }

      const shops = rows.map(s => ({
        shopId:       s.id,
        name:         (s.name as string) ?? null,
        gu:           (s.gu as string) ?? null,
        category:     (s.category as string) ?? null,
        todayOpen:    (s.today_open as boolean) ?? false,
        thumbnailUrl: (s.representative_image as string) ?? null,
        isPartner:    (s.is_partner as boolean) ?? false,
        address:      detailMap.get(s.id)?.roadAddress ?? null,
        phone:        detailMap.get(s.id)?.phone ?? null,
        naverReservationUrl: null,
      }));
      res.json({ shops, total: count ?? 0, page, limit });
    } catch (err) { next(err); }
  };

  // ── 소비자 가입자 목록 ────────────────────────────────────────
  listUsers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = parseInt(req.query.page as string ?? '1', 10);
      const limit = 50;
      const offset = (page - 1) * limit;
      const { rows } = await this.rds.query(
        `SELECT u.id, u.nickname, u.profile_image, u.created_at, u.status,
                COUNT(DISTINCT f.shop_id) AS favorite_count
         FROM users u
         LEFT JOIN favorites f ON f.user_id = u.id
         GROUP BY u.id ORDER BY u.created_at DESC LIMIT $1 OFFSET $2`,
        [limit, offset],
      );
      const { rows: [{ count }] } = await this.rds.query(`SELECT COUNT(*) FROM users`);
      res.json({ users: mapRows(rows), total: parseInt(count, 10), page, limit });
    } catch (err) { next(err); }
  };

  // ── 통계: 샵별 조회 수 (수퍼베이스 events 테이블, 페이지네이션) ─
  shopViewStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const period = ['30d','90d'].includes(req.query.period as string)
        ? parseInt(req.query.period as string, 10) : 7;
      const since = new Date(Date.now() - period * 24 * 60 * 60 * 1000).toISOString();

      // Supabase 1000건 한도 → 페이지네이션
      const BATCH = 1000;
      const allEvents: { shop_id: string | null; created_at: string }[] = [];
      let offset = 0;
      while (true) {
        const { data, error } = await this.sbClient
          .from('events')
          .select('shop_id, created_at')
          .eq('event', 'detail_view')
          .not('shop_id', 'is', null)
          .gte('created_at', since)
          .range(offset, offset + BATCH - 1);
        if (error) throw error;
        allEvents.push(...(data ?? []));
        if (!data || data.length < BATCH) break;
        offset += BATCH;
      }

      const shopCounts = new Map<string, number>();
      const dailyCounts = new Map<string, number>();
      for (const e of allEvents) {
        if (e.shop_id) shopCounts.set(e.shop_id, (shopCounts.get(e.shop_id) ?? 0) + 1);
        const date = e.created_at.slice(0, 10);
        dailyCounts.set(date, (dailyCounts.get(date) ?? 0) + 1);
      }

      const sorted = [...shopCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
      const shopMap = await fetchShopMap(this.sbClient, sorted.map(([id]) => id), 'id, name, gu');
      const stats = sorted.map(([shopId, views]) => ({
        shopId,
        shopName: (shopMap.get(shopId)?.name as string) ?? null,
        gu:       (shopMap.get(shopId)?.gu as string) ?? null,
        views:    String(views),
      }));
      const daily = [...dailyCounts.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, views]) => ({ date, views: String(views) }));

      res.json({
        period:      `${period}d`,
        total:       allEvents.length,
        uniqueShops: shopCounts.size,
        daily,
        stats,
      });
    } catch (err) { next(err); }
  };

  // ── 통계: web 방문자 추이 (session_start, platform 구분) ──────
  visitorTrend = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const period = ['30d','90d'].includes(req.query.period as string)
        ? parseInt(req.query.period as string, 10) : 7;
      const since = new Date(Date.now() - period * 24 * 60 * 60 * 1000).toISOString();

      const BATCH = 1000;
      const allSessions: { created_at: string; platform: string | null }[] = [];
      let offset = 0;
      while (true) {
        const { data, error } = await this.sbClient
          .from('events')
          .select('created_at, platform')
          .eq('event', 'session_start')
          .gte('created_at', since)
          .range(offset, offset + BATCH - 1);
        if (error) throw error;
        allSessions.push(...(data ?? []));
        if (!data || data.length < BATCH) break;
        offset += BATCH;
      }

      const webMap  = new Map<string, number>();
      const tossMap = new Map<string, number>();
      for (const s of allSessions) {
        const date = s.created_at.slice(0, 10);
        if ((s.platform || 'web') === 'web') {
          webMap.set(date, (webMap.get(date) ?? 0) + 1);
        } else {
          tossMap.set(date, (tossMap.get(date) ?? 0) + 1);
        }
      }

      const toArr = (m: Map<string, number>) =>
        [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count }));

      res.json({
        period:    `${period}d`,
        totalWeb:  [...webMap.values()].reduce((a, b) => a + b, 0),
        totalToss: [...tossMap.values()].reduce((a, b) => a + b, 0),
        web:       toArr(webMap),
        toss:      toArr(tossMap),
      });
    } catch (err) { next(err); }
  };

  // ── 통계: 취소석 알림 신청 건수 (수퍼베이스 leads 테이블) ─────
  cancelRequestStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const period = ['30d','90d'].includes(req.query.period as string)
        ? parseInt(req.query.period as string, 10) : 7;
      const since = new Date(Date.now() - period * 24 * 60 * 60 * 1000).toISOString();

      // Supabase 기본 1000행 한도 → 페이지네이션으로 전량 수집
      const BATCH = 1000;
      const leads: { created_at: string }[] = [];
      let lOffset = 0;
      while (true) {
        const { data, error } = await this.sbClient
          .from('leads')
          .select('created_at')
          .eq('kind', 'missed_seat_alert')
          .gte('created_at', since)
          .range(lOffset, lOffset + BATCH - 1);
        if (error) throw error;
        leads.push(...((data ?? []) as { created_at: string }[]));
        if (!data || data.length < BATCH) break;
        lOffset += BATCH;
      }

      const dailyCounts = new Map<string, number>();
      for (const l of leads) {
        const date = (l.created_at as string).slice(0, 10);
        dailyCounts.set(date, (dailyCounts.get(date) ?? 0) + 1);
      }
      const daily = [...dailyCounts.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date, count: String(count) }));

      res.json({ period: `${period}d`, daily, total: leads.length });
    } catch (err) { next(err); }
  };

  // ── 통계: 파트너샵 전환율 ─────────────────────────────────────
  partnerConversionStats = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const [{ rows: [{ issued }] }, { rows: [{ converted }] }] = await Promise.all([
        this.rds.query(`SELECT COUNT(*) AS issued FROM partner_codes`),
        this.rds.query(`SELECT COUNT(*) AS converted FROM owner_accounts WHERE shop_id IS NOT NULL`),
      ]);
      res.json({ issuedCodes: parseInt(issued, 10), convertedOwners: parseInt(converted, 10) });
    } catch (err) { next(err); }
  };

  // ── 사용자 상태 변경 (정지/차단) AD-007 ──────────────────────
  updateUserStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { status } = req.body as { status?: string };
      if (status !== 'active' && status !== 'banned')
        return next(Errors.validation({ status: 'active 또는 banned 값이 필요합니다' }));
      await this.rds.query('UPDATE users SET status = $2 WHERE id = $1', [req.params.userId, status]);
      res.json({ ok: true });
    } catch (err) { next(err); }
  };

  // ── 통계: 예약 버튼 클릭 수 (수퍼베이스 events 테이블, 페이지네이션) ─
  reservationClickStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const period = ['30d','90d'].includes(req.query.period as string)
        ? parseInt(req.query.period as string, 10) : 7;
      const since = new Date(Date.now() - period * 24 * 60 * 60 * 1000).toISOString();

      const BATCH = 1000;
      const allEvents: { shop_id: string | null }[] = [];
      let offset = 0;
      while (true) {
        const { data, error } = await this.sbClient
          .from('events')
          .select('shop_id')
          .eq('event', 'reserve_click')
          .not('shop_id', 'is', null)
          .gte('created_at', since)
          .range(offset, offset + BATCH - 1);
        if (error) throw error;
        allEvents.push(...(data ?? []));
        if (!data || data.length < BATCH) break;
        offset += BATCH;
      }

      const shopCounts = new Map<string, number>();
      for (const e of allEvents) {
        if (e.shop_id) shopCounts.set(e.shop_id, (shopCounts.get(e.shop_id) ?? 0) + 1);
      }
      const sorted = [...shopCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
      const shopMap = await fetchShopMap(this.sbClient, sorted.map(([id]) => id), 'id, name, gu');
      const stats = sorted.map(([shopId, clicks]) => ({
        shopId,
        shopName: (shopMap.get(shopId)?.name as string) ?? null,
        gu:       (shopMap.get(shopId)?.gu as string) ?? null,
        clicks:   String(clicks),
      }));
      res.json({ period: `${period}d`, stats });
    } catch (err) { next(err); }
  };

  // ── 샵 도입 문의 목록 ─────────────────────────────────────────
  listInquiries = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const status = (req.query.status as string) ?? 'pending';
      const { rows } = await this.rds.query(
        `SELECT id, shop_name, contact, gu, category, note, status, created_at, reviewed_at
         FROM shop_inquiries WHERE status = $1 ORDER BY created_at DESC LIMIT 100`,
        [status],
      );
      res.json({ inquiries: mapRows(rows) });
    } catch (err) { next(err); }
  };

  // ── 샵 도입 문의 상태 변경 ───────────────────────────────────
  updateInquiry = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { status } = req.body as { status?: string };
      if (status !== 'approved' && status !== 'rejected')
        return next(Errors.validation({ status: 'approved 또는 rejected 값이 필요합니다' }));
      const { rowCount } = await this.rds.query(
        `UPDATE shop_inquiries SET status = $2, reviewed_at = NOW() WHERE id = $1`,
        [req.params.inquiryId, status],
      );
      if (!rowCount) return next(Errors.notFound({ inquiryId: req.params.inquiryId }));
      res.json({ ok: true });
    } catch (err) { next(err); }
  };

  // ── 파트너샵 직접 등록 (Supabase) ────────────────────────────
  createShop = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { name, gu, address, category, phone, thumbnailUrl, naverReservationUrl } =
        req.body as Record<string, string | undefined>;
      if (!name || !gu || !category)
        return next(Errors.validation({ name: 'name, gu, category는 필수입니다' }));
      const { data, error } = await this.sbClient
        .from('shops')
        .insert({
          name,
          gu,
          category,
          categories:             [category],
          road_address:           address ?? null,
          is_partner:             true,
          today_open:             false,
        })
        .select('id, name, gu, category, is_partner')
        .single();
      if (error) throw error;
      res.status(201).json({ shopId: (data as Record<string, unknown>).id, ...data });
    } catch (err) { next(err); }
  };

  // ── 파트너샵 정보 수정 ───────────────────────────────────────
  updateShop = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = req.body as Record<string, unknown>;
      const update: Record<string, unknown> = {};
      if (body.name     !== undefined) update.name     = body.name;
      if (body.gu       !== undefined) update.gu       = body.gu;
      if (body.category !== undefined) { update.category = body.category; update.categories = [body.category]; }
      if (body.address  !== undefined) update.road_address = body.address;
      if (body.isPartner !== undefined) update.is_partner = body.isPartner;

      if (!Object.keys(update).length)
        return next(Errors.validation({ fields: '변경할 필드가 없습니다' }));

      const { error } = await this.sbClient
        .from('shops')
        .update(update)
        .eq('id', req.params.shopId);
      if (error) throw error;
      res.json({ ok: true });
    } catch (err) { next(err); }
  };

  // ── 파트너샵 삭제 ────────────────────────────────────────────
  deleteShop = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { error } = await this.sbClient
        .from('shops')
        .delete()
        .eq('id', req.params.shopId);
      if (error) throw error;
      res.status(204).send();
    } catch (err) { next(err); }
  };

  // ── 마케팅 스냅샷: 날짜 목록 ─────────────────────────────────
  listMarketingDates = async (_req: Request, res: Response): Promise<void> => {
    try {
      const { data, error } = await this.sbClient
        .from('marketing_snapshots')
        .select('snapshot_date')
        .order('snapshot_date', { ascending: false })
        .limit(180);
      if (error) throw error;
      res.json({ dates: (data ?? []).map(r => (r as { snapshot_date: string }).snapshot_date) });
    } catch (err) {
      // 테이블 미생성/빈 상태에서도 관리자 화면이 죽지 않도록 빈 응답
      console.error('[listMarketingDates]', (err as Error).message);
      res.json({ dates: [] });
    }
  };

  // ── 일일 리포트 (관리자 첫 진입 시 모달) ─────────────────────
  /** 전날 기준: 웹 조회수 · 신규 소비자 회원 · 신규 도입 문의 + 최신 마케팅 AI 조언 */
  dailyReport = async (_req: Request, res: Response): Promise<void> => {
    try {
      // KST 기준 '어제' 00:00 ~ 오늘 00:00
      const nowKst = new Date(Date.now() + 9 * 3600 * 1000);
      const y = new Date(nowKst); y.setUTCDate(y.getUTCDate() - 1);
      const dayStr = y.toISOString().slice(0, 10);                       // YYYY-MM-DD (KST 어제)
      const start = new Date(`${dayStr}T00:00:00+09:00`).toISOString();
      const end   = new Date(`${nowKst.toISOString().slice(0, 10)}T00:00:00+09:00`).toISOString();

      const [viewsRes, { rows: uRows }, { rows: iRows }, { rows: pRows }, mktRes] = await Promise.all([
        this.sbClient.from('events').select('id', { count: 'exact', head: true })
          .eq('event', 'detail_view').gte('created_at', start).lt('created_at', end),
        this.rds.query(`SELECT COUNT(*) AS cnt FROM users WHERE created_at >= $1 AND created_at < $2`, [start, end]),
        this.rds.query(`SELECT COUNT(*) AS cnt FROM shop_inquiries WHERE created_at >= $1 AND created_at < $2`, [start, end]),
        this.rds.query(`SELECT COUNT(*) AS cnt FROM shop_inquiries WHERE status = 'pending'`),
        this.sbClient.from('marketing_snapshots').select('snapshot_date, data')
          .order('snapshot_date', { ascending: false }).limit(1),
      ]);

      const snap = (mktRes.data ?? [])[0] as { snapshot_date: string; data: MarketingSnapshotData } | undefined;
      const marketing = snap
        ? {
            date: snap.snapshot_date,
            instagram: snap.data?.instagram?.aiAdvice ?? null,
            threads:   snap.data?.threads?.aiAdvice ?? null,
            followUp:  snap.data?.instagram?.aiFollowUp ?? snap.data?.threads?.aiFollowUp ?? null,
          }
        : null;

      res.json({
        date: dayStr,
        views:        viewsRes.count ?? 0,
        newUsers:     parseInt(uRows[0].cnt as string, 10),
        newInquiries: parseInt(iRows[0].cnt as string, 10),
        pendingInquiries: parseInt(pRows[0].cnt as string, 10),
        marketing,
      });
    } catch (err) {
      console.error('[dailyReport]', (err as Error).message);
      res.json({ date: null, views: 0, newUsers: 0, newInquiries: 0, pendingInquiries: 0, marketing: null });
    }
  };

  // ── 마케팅 스냅샷: 최근 N일 추세 (카드 클릭 시 그래프용) ──────
  listMarketingTrend = async (req: Request, res: Response): Promise<void> => {
    try {
      const days = Math.min(Math.max(parseInt((req.query.days as string) ?? '30', 10) || 30, 1), 180);
      const { data, error } = await this.sbClient
        .from('marketing_snapshots')
        .select('snapshot_date, data')
        .order('snapshot_date', { ascending: false })
        .limit(days);
      if (error) throw error;
      const snapshots = ((data ?? []) as { snapshot_date: string; data: unknown }[])
        .map(r => ({ date: r.snapshot_date, data: r.data }))
        .reverse(); // 오래된 → 최신 (차트 x축 순서)
      res.json({ snapshots });
    } catch (err) {
      console.error('[listMarketingTrend]', (err as Error).message);
      res.json({ snapshots: [] });
    }
  };

  // ── 마케팅 스냅샷: 특정 날짜(없으면 최신) ────────────────────
  getMarketing = async (req: Request, res: Response): Promise<void> => {
    try {
      const date = req.query.date as string | undefined;
      let q = this.sbClient
        .from('marketing_snapshots')
        .select('snapshot_date, data')
        .order('snapshot_date', { ascending: false })
        .limit(1);
      if (date) q = this.sbClient
        .from('marketing_snapshots')
        .select('snapshot_date, data')
        .eq('snapshot_date', date)
        .limit(1);
      const { data, error } = await q;
      if (error) throw error;
      const row = (data ?? [])[0] as { snapshot_date: string; data: unknown } | undefined;
      res.json({ date: row?.snapshot_date ?? null, data: row?.data ?? null });
    } catch (err) {
      console.error('[getMarketing]', (err as Error).message);
      res.json({ date: null, data: null });
    }
  };

  // ── 시안 이미지 생성: NVIDIA FLUX → Storage → 스냅샷에 append ──
  generateMarketingImages = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const count = Math.min(Math.max(parseInt(String(req.body?.count ?? 5), 10) || 5, 1), 10);
      const result = await runImageGeneration(this.sbClient, count);
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  // ── 시안 이미지 삭제: Storage 객체 + 스냅샷 data.images 동시 제거 ──
  deleteMarketingImage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const imageId = req.params.imageId;
      // 이미지 id는 `YYYY-MM-DD-n` 형식이라 날짜를 유추할 수 있다. 쿼리로 넘어오면 그걸 우선.
      const date = (req.query.date as string | undefined) || imageId.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.status(400).json({ error: '이미지의 스냅샷 날짜를 확인할 수 없습니다', code: 'BAD_REQUEST' });
        return;
      }

      const { data: rows, error } = await this.sbClient
        .from('marketing_snapshots')
        .select('snapshot_date, data')
        .eq('snapshot_date', date)
        .limit(1);
      if (error) throw error;

      const row = (rows ?? [])[0] as { snapshot_date: string; data: MarketingSnapshotData } | undefined;
      const images = row?.data?.images ?? [];
      const target = images.find(im => im.id === imageId);
      if (!target) {
        res.status(404).json({ error: '이미지를 찾을 수 없습니다', code: 'NOT_FOUND' });
        return;
      }

      // 공개 URL → 버킷 내부 경로 (`2026-07-10/1.jpg`)
      const marker = `/storage/v1/object/public/${MARKETING_BUCKET}/`;
      const at = target.url.indexOf(marker);
      if (at >= 0) {
        const path = decodeURIComponent(target.url.slice(at + marker.length));
        const { error: rmErr } = await this.sbClient.storage.from(MARKETING_BUCKET).remove([path]);
        // 스토리지에서 이미 사라진 경우에도 목록에서는 지워야 하므로 실패해도 계속 진행한다.
        if (rmErr) console.error('[deleteMarketingImage] storage', rmErr.message, path);
      }

      const nextData: MarketingSnapshotData = { ...row!.data, images: images.filter(im => im.id !== imageId) };
      const { error: upErr } = await this.sbClient
        .from('marketing_snapshots')
        .update({ data: nextData, updated_at: new Date().toISOString() })
        .eq('snapshot_date', date);
      if (upErr) throw upErr;

      res.json({ ok: true, id: imageId, remaining: nextData.images!.length });
    } catch (err) {
      next(err);
    }
  };

  // ── 대시보드 요약 (SSE fallback) ─────────────────────────────
  dashboardSummary = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const [
        { rows: uR }, { rows: oR }, partnerRes, { rows: cR }, viewsRes, { rows: iR },
      ] = await Promise.all([
        this.rds.query(`SELECT COUNT(*) AS cnt FROM users`),
        this.rds.query(`SELECT COUNT(*) AS cnt FROM owner_accounts`),
        this.sbClient.from('shops').select('id', { count: 'exact', head: true }).eq('is_partner', true),
        this.rds.query(`SELECT COUNT(*) AS cnt FROM partner_codes WHERE used = FALSE AND expires_at > NOW()`),
        this.sbClient.from('events').select('id', { count: 'exact', head: true })
          .eq('event', 'detail_view').gte('created_at', since7d),
        this.rds.query(`SELECT COUNT(*) AS cnt FROM shop_inquiries WHERE status = 'pending'`),
      ]);
      res.json({
        users:        parseInt(uR[0].cnt as string, 10),
        owners:       parseInt(oR[0].cnt as string, 10),
        partnerShops: partnerRes.count ?? 0,
        views7d:      viewsRes.count ?? 0,
        openCodes:    parseInt(cR[0].cnt as string, 10),
        pendingInquiries: parseInt(iR[0].cnt as string, 10),
      });
    } catch (err) { next(err); }
  };

  // ── 트렌드 (일별 신규 가입·코드) — 30일 ─────────────────────
  getTrends = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const [
        { rows: userRows },
        { rows: ownerRows },
        { rows: codeRows },
      ] = await Promise.all([
        this.rds.query(
          `SELECT date_trunc('day', created_at)::date AS date, COUNT(*)::int AS count
           FROM users WHERE created_at >= $1
           GROUP BY 1 ORDER BY 1`,
          [since30d],
        ),
        this.rds.query(
          `SELECT date_trunc('day', created_at)::date AS date, COUNT(*)::int AS count
           FROM owner_accounts WHERE created_at >= $1
           GROUP BY 1 ORDER BY 1`,
          [since30d],
        ),
        this.rds.query(
          `SELECT date_trunc('day', created_at)::date AS date, COUNT(*)::int AS count
           FROM partner_codes WHERE created_at >= $1
           GROUP BY 1 ORDER BY 1`,
          [since30d],
        ),
      ]);

      // 뷰 이벤트 — Supabase 1000건 기본 한도 → 페이지네이션으로 30일 전량 수집
      const BATCH = 1000;
      const viewEvents: { created_at: string }[] = [];
      let vOffset = 0;
      while (true) {
        const { data, error } = await this.sbClient
          .from('events')
          .select('created_at')
          .eq('event', 'detail_view')
          .gte('created_at', since30d)
          .range(vOffset, vOffset + BATCH - 1);
        if (error) throw error;
        viewEvents.push(...((data ?? []) as { created_at: string }[]));
        if (!data || data.length < BATCH) break;
        vOffset += BATCH;
      }

      const fmtRows = (rows: Record<string, unknown>[]) =>
        rows.map(r => ({ date: String(r.date).slice(0, 10), count: Number(r.count) }));

      // 뷰 이벤트 일별 집계
      const viewMap = new Map<string, number>();
      for (const e of viewEvents) {
        const d = (e.created_at as string).slice(0, 10);
        viewMap.set(d, (viewMap.get(d) ?? 0) + 1);
      }
      const viewDaily = [...viewMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date, count }));

      res.json({
        users:   fmtRows(userRows),
        owners:  fmtRows(ownerRows),
        codes:   fmtRows(codeRows),
        views:   viewDaily,
      });
    } catch (err) { next(err); }
  };
}
