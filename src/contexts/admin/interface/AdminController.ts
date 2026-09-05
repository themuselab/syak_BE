import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { Pool } from 'pg';
import { Errors } from '../../../shared/errors/AppError';
import { initAdminSSE, AdminSSEService } from '../infrastructure/AdminSSEService';
import {
  generateMarketingImages as runImageGeneration, ImageGenConfigError, MarketingImage,
} from '../infrastructure/MarketingImageService';
import { s3Delete, s3PresignGet } from '../infrastructure/S3Service';
import { replyToThread, publishThread, generateThreadsDraft, ThreadsConfigError } from '../infrastructure/ThreadsPublishService';
import {
  ga4Overview, ga4TopShops, ga4EventCount, ga4Acquisition,
  ga4DailyEventCount, ga4DistinctShops, ga4VisitorsDaily, ga4EventCountForShops, GA4ConfigError,
} from '../infrastructure/GA4Service';
import { awsMonthToDate, awsFreeTier, AwsCostConfigError, type AwsCostResponse } from '../infrastructure/AwsCostService';

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

/**
 * Supabase PostgREST 기본 1000행 한도를 넘겨 전량 수집한다.
 * buildPage(from,to)는 range()까지 적용된 쿼리를 만들어 반환한다.
 * (통계 핸들러들이 이 페이지네이션을 복붙하다 1000행 누락 버그를 반복해 헬퍼로 통합)
 */
async function fetchAllRows<T>(
  buildPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  batch = 1000,
): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await buildPage(offset, offset + batch - 1);
    if (error) throw error;
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < batch) break;
    offset += batch;
  }
  return all;
}

/** 여러 shopId에 대한 샵 정보를 한 번에 가져오는 헬퍼 (RDS) */
async function fetchShopMap(
  rds: Pool,
  shopIds: string[],
  cols = 'id, name, gu, category',
): Promise<Map<string, Record<string, unknown>>> {
  if (!shopIds.length) return new Map();
  try {
    const { rows } = await rds.query(`SELECT ${cols} FROM shops WHERE id = ANY($1::text[])`, [shopIds]);
    return new Map(rows.map(s => [s.id as string, s as Record<string, unknown>]));
  } catch (err) {
    console.error('[fetchShopMap] error', (err as Error).message, { shopIds: shopIds.slice(0, 3), cols });
    return new Map();
  }
}

export class AdminController {
  public readonly sse: AdminSSEService;

  constructor(
    private readonly rds: Pool,
  ) {
    this.sse = initAdminSSE(rds);
  }

  // ── 통계 인메모리 캐시 ────────────────────────────────────────
  // 통계는 관리자만 보고 과거 집계는 거의 안 바뀐다. 매번 Supabase를 1000행씩
  // 여러 번 왕복하는 대신 짧게 캐시 → 반복 조회 시 왕복 0 (무료티어 지연 회피).
  // (운영에 Redis가 없어 인메모리 사용. shopFilterCache와 동일 방식. 서버 재시작 시 소멸)
  private static readonly STATS_TTL = 120_000; // 2분
  private statsCache = new Map<string, { at: number; data: unknown }>();
  private async cachedStats<T>(key: string, compute: () => Promise<T>): Promise<T> {
    const hit = this.statsCache.get(key);
    if (hit && Date.now() - hit.at < AdminController.STATS_TTL) return hit.data as T;
    const data = await compute();
    this.statsCache.set(key, { at: Date.now(), data });
    return data;
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
      const shopMap = await fetchShopMap(this.rds, shopIds, 'id, name, gu');
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

      // 샵 id = 네이버 place id (RDS). 있으면 갱신, 없으면 생성. 주소는 detail.roadAddress.
      const shopId = body.placeId;
      const cats = body.category ? [body.category] : [];
      await this.rds.query(
        `INSERT INTO shops (id, name, gu, category, categories, representative_image, detail, today_open, is_partner)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, jsonb_build_object('roadAddress', $7::text), false, false)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name, gu = EXCLUDED.gu, category = EXCLUDED.category,
           categories = EXCLUDED.categories,
           representative_image = COALESCE(EXCLUDED.representative_image, shops.representative_image),
           detail = COALESCE(shops.detail, '{}'::jsonb) || jsonb_build_object('roadAddress', $7::text)`,
        [shopId, body.name, body.gu ?? '', body.category ?? '', JSON.stringify(cats),
         body.imageUrl || null, body.address ?? ''],
      );

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
      // 파트너샵(is_partner=true)은 소수라 detail->>phone을 한 번에 뽑아도 안전(detoast/timeout은
      // 45k 전체 정렬에서만 문제 — listAllShops는 2단계로 회피). 1000행 한도만 넘겨 수집.
      const { rows: shops } = await this.rds.query(
        `SELECT id, name, gu, category, today_open, representative_image, partner_synced_at, pilot_coupon,
                detail->>'phone' AS phone
         FROM shops WHERE is_partner = true ORDER BY partner_synced_at DESC NULLS LAST`,
      );

      const result = shops.map(s => ({
        shopId:             s.id,
        name:               s.name,
        gu:                 s.gu,
        category:           s.category,
        todayOpen:          s.today_open ?? false,
        thumbnailUrl:       s.representative_image ?? null,
        partnerSyncedAt:    s.partner_synced_at ?? null,
        pilotCoupon:        s.pilot_coupon ?? null,
        phone:              s.phone ?? null,
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
      const { rows } = await this.rds.query(
        `SELECT detail->>'roadAddress' AS road_address FROM shops WHERE gu = $1 LIMIT 5`, [gu],
      );
      for (const r of rows as { road_address: string | null }[]) {
        const hit = AdminController.matchSido(r.road_address?.trim().split(/\s+/)[0]);
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
      const { rows: shopRows } = await this.rds.query<{ category: string | null; gu: string | null }>(
        `SELECT DISTINCT category, gu FROM shops`,
      );
      const cats = new Set<string>();
      const gus  = new Set<string>();
      for (const r of shopRows) {
        if (r.category) cats.add(r.category);
        if (r.gu) gus.add(r.gu);
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
      // 기본 인기순(review) — 이름순이면 '__','감' 같은 이상한 스크랩 이름이 앞에 옴
      const sort     = ['name', 'category', 'gu', 'review'].includes(sortRaw ?? '') ? sortRaw! : 'review';
      const ascending = req.query.dir !== 'desc';
      const limit  = 50;
      const offset = (page - 1) * limit;

      // ⚠️ detail(JSONB)은 menus/reviews/images를 품은 대용량 컬럼이다.
      //    4만 행을 정렬하면서 detail->>phone 을 함께 뽑으면 statement timeout(57014) 발생.
      //    → 1단계: 가벼운 목록 조회 / 2단계: 그 페이지의 id에 대해서만 전화번호·주소 조회
      const cond: string[] = [];
      const params: unknown[] = [];
      const add = (v: unknown) => { params.push(v); return `$${params.length}`; };
      if (search)   cond.push(`name ILIKE ${add(`%${search}%`)}`);
      if (category) cond.push(`category = ${add(category)}`);
      if (gu) {
        cond.push(`gu = ${add(gu)}`);
      } else if (sido) {
        const list = await this.gusOfSido(sido);
        if (!list.length) { res.json({ shops: [], total: 0, page, limit }); return; }
        cond.push(`gu = ANY(${add(list)}::text[])`);
      }
      const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
      const dir = ascending ? 'ASC' : 'DESC';
      const orderExpr = sort === 'review'
        ? 'review_count DESC NULLS LAST'
        : `${(['name', 'gu', 'category'] as string[]).includes(sort) ? sort : 'name'} ${dir} NULLS LAST`;

      // 전체 건수: 필터 없으면 통계 근사치(reltuples)로 빠르게, 있으면 정확 카운트
      let total: number;
      if (cond.length) {
        const c = await this.rds.query(`SELECT COUNT(*)::int AS n FROM shops ${where}`, params);
        total = c.rows[0].n as number;
      } else {
        const c = await this.rds.query(`SELECT reltuples::bigint AS n FROM pg_class WHERE relname = 'shops'`);
        total = Number(c.rows[0]?.n ?? 0);
      }

      const { rows } = await this.rds.query(
        `SELECT id, name, gu, category, today_open, representative_image, is_partner,
                detail->>'phone' AS phone, detail->>'roadAddress' AS road_address
         FROM shops ${where} ORDER BY ${orderExpr}
         LIMIT ${add(limit)} OFFSET ${add(offset)}`,
        params,
      );
      const shops = rows.map(s => ({
        shopId:       s.id,
        name:         (s.name as string) ?? null,
        gu:           (s.gu as string) ?? null,
        category:     (s.category as string) ?? null,
        todayOpen:    (s.today_open as boolean) ?? false,
        thumbnailUrl: (s.representative_image as string) ?? null,
        isPartner:    (s.is_partner as boolean) ?? false,
        address:      (s.road_address as string) ?? null,
        phone:        (s.phone as string) ?? null,
        naverReservationUrl: null,
      }));
      res.json({ shops, total, page, limit });
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

  // ── 통계: 샵별 조회 수 (GA4 shop_view) ───────────────────────
  shopViewStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const period = ['30d','90d'].includes(req.query.period as string)
        ? parseInt(req.query.period as string, 10) : 7;
      const result = await this.cachedStats(`shopViews:${period}`, async () => {
        const [top, daily, total, uniqueShops] = await Promise.all([
          ga4TopShops('shop_view', period, 20),
          ga4DailyEventCount('shop_view', period),
          ga4EventCount('shop_view', period),
          ga4DistinctShops('shop_view', period),
        ]);
        const shopMap = await fetchShopMap(this.rds, top.map(t => t.shopId), 'id, name, gu');
        const stats = top.map(t => ({
          shopId: t.shopId,
          shopName: (shopMap.get(t.shopId)?.name as string) ?? null,
          gu:       (shopMap.get(t.shopId)?.gu as string) ?? null,
          views:    String(t.count),
        }));
        return {
          period: `${period}d`, total, uniqueShops,
          daily: daily.map(d => ({ date: d.date, views: String(d.value) })),
          stats,
        };
      });
      res.json(result);
    } catch (err) { this.ga4Handle(res, err); }
  };

  // ── 통계: 방문자 추이 (GA4 sessions, web/앱 구분) ─────────────
  visitorTrend = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const period = ['30d','90d'].includes(req.query.period as string)
        ? parseInt(req.query.period as string, 10) : 7;
      const result = await this.cachedStats(`visitors:${period}`, async () => {
        const v = await ga4VisitorsDaily(period);
        return {
          period:    `${period}d`,
          totalWeb:  v.totalWeb,
          totalToss: v.totalToss,
          web:       v.web.map(d => ({ date: d.date, count: d.value })),
          toss:      v.toss.map(d => ({ date: d.date, count: d.value })),
        };
      });
      res.json(result);
    } catch (err) { this.ga4Handle(res, err); }
  };

  // ── 통계: 취소석 알림 신청 건수 (수퍼베이스 leads 테이블) ─────
  cancelRequestStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const period = ['30d','90d'].includes(req.query.period as string)
        ? parseInt(req.query.period as string, 10) : 7;
      const result = await this.cachedStats(`cancelReq:${period}`, async () => {
        const since = new Date(Date.now() - period * 24 * 60 * 60 * 1000).toISOString();
        const { rows } = await this.rds.query(
          `SELECT to_char((created_at AT TIME ZONE 'Asia/Seoul')::date, 'YYYY-MM-DD') AS date, COUNT(*)::int AS count
           FROM leads WHERE kind = 'missed_seat_alert' AND created_at >= $1
           GROUP BY 1 ORDER BY 1`,
          [since],
        );
        const daily = rows.map(r => ({ date: r.date as string, count: String(r.count) }));
        const total = rows.reduce((a, r) => a + Number(r.count), 0);
        return { period: `${period}d`, daily, total };
      });
      res.json(result);
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

  // ── 사용자 완전 삭제 (테스트 계정 정리용) ─────────────────────
  // 자식 행(favorites·소셜계정·refresh 토큰·디바이스 등)은 FK ON DELETE CASCADE로 함께 삭제된다.
  deleteUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { rowCount } = await this.rds.query('DELETE FROM users WHERE id = $1', [req.params.userId]);
      if (!rowCount) return next(Errors.notFound());
      res.status(204).send();
    } catch (err) { next(err); }
  };

  // ── 통계: 예약 버튼 클릭 수 (GA4 reserve_click) ──────────────
  reservationClickStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const period = ['30d','90d'].includes(req.query.period as string)
        ? parseInt(req.query.period as string, 10) : 7;
      const result = await this.cachedStats(`reserveClicks:${period}`, async () => {
        const top = await ga4TopShops('reserve_click', period, 20);
        const shopMap = await fetchShopMap(this.rds, top.map(t => t.shopId), 'id, name, gu');
        const stats = top.map(t => ({
          shopId: t.shopId,
          shopName: (shopMap.get(t.shopId)?.name as string) ?? null,
          gu:       (shopMap.get(t.shopId)?.gu as string) ?? null,
          clicks:   String(t.count),
        }));
        return { period: `${period}d`, stats };
      });
      res.json(result);
    } catch (err) { this.ga4Handle(res, err); }
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
      const id = crypto.randomUUID();
      void phone; void thumbnailUrl; void naverReservationUrl;
      await this.rds.query(
        `INSERT INTO shops (id, name, gu, category, categories, detail, is_partner, today_open)
         VALUES ($1, $2, $3, $4, $5::jsonb, jsonb_build_object('roadAddress', $6::text), true, false)`,
        [id, name, gu, category, JSON.stringify([category]), address ?? ''],
      );
      res.status(201).json({ shopId: id, id, name, gu, category, is_partner: true });
    } catch (err) { next(err); }
  };

  // ── 파트너샵 정보 수정 ───────────────────────────────────────
  updateShop = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = req.body as Record<string, unknown>;
      const sets: string[] = [];
      const params: unknown[] = [req.params.shopId];
      const add = (v: unknown) => { params.push(v); return `$${params.length}`; };
      if (body.name     !== undefined) sets.push(`name = ${add(body.name)}`);
      if (body.gu       !== undefined) sets.push(`gu = ${add(body.gu)}`);
      if (body.category !== undefined) {
        sets.push(`category = ${add(body.category)}`);
        sets.push(`categories = ${add(JSON.stringify([body.category]))}::jsonb`);
      }
      if (body.isPartner !== undefined) sets.push(`is_partner = ${add(body.isPartner)}`);
      if (body.address  !== undefined) {
        sets.push(`detail = COALESCE(detail, '{}'::jsonb) || jsonb_build_object('roadAddress', ${add(String(body.address))}::text)`);
      }
      if (!sets.length) return next(Errors.validation({ fields: '변경할 필드가 없습니다' }));

      await this.rds.query(`UPDATE shops SET ${sets.join(', ')} WHERE id = $1`, params);
      res.json({ ok: true });
    } catch (err) { next(err); }
  };

  // ── 파트너샵 삭제 ────────────────────────────────────────────
  deleteShop = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.rds.query(`DELETE FROM shops WHERE id = $1`, [req.params.shopId]);
      res.status(204).send();
    } catch (err) { next(err); }
  };

  // ── 마케팅 스냅샷: 날짜 목록 ─────────────────────────────────
  listMarketingDates = async (_req: Request, res: Response): Promise<void> => {
    try {
      const { rows } = await this.rds.query(
        `SELECT to_char(snapshot_date, 'YYYY-MM-DD') AS d FROM marketing_snapshots
         ORDER BY snapshot_date DESC LIMIT 180`,
      );
      res.json({ dates: rows.map(r => r.d as string) });
    } catch (err) {
      // 테이블 미생성/빈 상태에서도 관리자 화면이 죽지 않도록 빈 응답
      console.error('[listMarketingDates]', (err as Error).message);
      res.json({ dates: [] });
    }
  };

  // ── 일일 리포트 (관리자 첫 진입 시 모달) ─────────────────────
  /** 전날 기준: 웹 조회수 · 신규 소비자 회원 · 신규 도입 문의 + 최신 마케팅 AI 조언 */
  // ── 파트너샵 조회·예약클릭 (파트너 집합 × GA4) ─────────────────
  /** 파트너 샵 id 집합 (RDS: 오너 연동 + 코드 발급). Supabase is_partner는 정지 중이라 RDS 기준. */
  private async partnerShopIds(): Promise<{ all: string[]; linked: number; coded: number }> {
    const [a, l, c] = await Promise.all([
      this.rds.query(
        `SELECT DISTINCT shop_id FROM (
           SELECT shop_id FROM owner_accounts WHERE shop_id IS NOT NULL
           UNION SELECT shop_id FROM partner_codes
         ) t`,
      ),
      this.rds.query(`SELECT COUNT(*) AS c FROM owner_accounts WHERE shop_id IS NOT NULL`),
      this.rds.query(`SELECT COUNT(DISTINCT shop_id) AS c FROM partner_codes`),
    ]);
    return {
      all: a.rows.map(r => r.shop_id as string),
      linked: parseInt(l.rows[0].c as string, 10),
      coded: parseInt(c.rows[0].c as string, 10),
    };
  }

  private async computePartnerEngagement(start: string, end: string): Promise<{
    partnerCount: number; linkedCount: number; codeCount: number; views: number; clicks: number;
  }> {
    const { all, linked, coded } = await this.partnerShopIds();
    const [views, clicks] = await Promise.all([
      ga4EventCountForShops('shop_view', all, { start, end }).catch(() => 0),
      ga4EventCountForShops('reserve_click', all, { start, end }).catch(() => 0),
    ]);
    return { partnerCount: all.length, linkedCount: linked, codeCount: coded, views, clicks };
  }

  /** 내부용(디코 리포트 등) — 파트너샵 조회·예약클릭. period=1d|7d|30d */
  partnerEngagement = async (req: Request, res: Response): Promise<void> => {
    try {
      const period = (req.query.period as string) ?? '7d';
      const range: Record<string, [string, string]> = {
        '1d': ['yesterday', 'yesterday'], '7d': ['7daysAgo', 'today'], '30d': ['30daysAgo', 'today'],
      };
      const [start, end] = range[period] ?? range['7d'];
      const data = await this.computePartnerEngagement(start, end);
      res.json({ period, ...data });
    } catch (err) {
      res.status(502).json({ code: 'PARTNER_ENGAGEMENT_FAILED', message: (err as Error).message });
    }
  };

  // ── AWS 이번 달 비용 + 프리티어 잔여 (Cost Explorer/FreeTier, 12h 캐시) ──
  private awsCostCache: { at: number; data: AwsCostResponse | null } = { at: 0, data: null };
  awsCost = async (_req: Request, res: Response): Promise<void> => {
    try {
      if (this.awsCostCache.data && Date.now() - this.awsCostCache.at < 12 * 3600 * 1000) {
        res.json(this.awsCostCache.data); return;
      }
      const [costR, ftR] = await Promise.allSettled([awsMonthToDate(), awsFreeTier()]);
      const errMsg = (r: PromiseRejectedResult) =>
        r.reason instanceof AwsCostConfigError ? r.reason.message : (r.reason as Error)?.message ?? '조회 실패';

      const data: AwsCostResponse = {
        cost:          costR.status === 'fulfilled' ? costR.value : null,
        costError:     costR.status === 'rejected' ? errMsg(costR) : null,
        freeTier:      ftR.status === 'fulfilled' ? ftR.value : null,
        freeTierError: ftR.status === 'rejected' ? errMsg(ftR) : null,
      };
      // 둘 다 실패면 캐시하지 않음(권한 설정 후 바로 반영되게)
      if (data.cost || data.freeTier) this.awsCostCache = { at: Date.now(), data };
      res.json(data);
    } catch (err) {
      res.status(502).json({ code: 'AWS_COST_FAILED', message: (err as Error).message });
    }
  };

  dailyReport = async (_req: Request, res: Response): Promise<void> => {
    try {
      // KST 기준 '어제' 00:00 ~ 오늘 00:00
      const nowKst = new Date(Date.now() + 9 * 3600 * 1000);
      const y = new Date(nowKst); y.setUTCDate(y.getUTCDate() - 1);
      const dayStr = y.toISOString().slice(0, 10);                       // YYYY-MM-DD (KST 어제)
      const start = new Date(`${dayStr}T00:00:00+09:00`).toISOString();
      const end   = new Date(`${nowKst.toISOString().slice(0, 10)}T00:00:00+09:00`).toISOString();

      // 어제 샵 조회수는 GA4(shop_view)에서. GA4 실패해도 리포트는 나오게 0 처리.
      const yesterdayViews = ga4DailyEventCount('shop_view', 2)
        .then(rows => rows.find(r => r.date === dayStr)?.value ?? 0)
        .catch(() => 0);

      const [views, { rows: uRows }, { rows: iRows }, { rows: pRows }, mktRes, partner] = await Promise.all([
        yesterdayViews,
        this.rds.query(`SELECT COUNT(*) AS cnt FROM users WHERE created_at >= $1 AND created_at < $2`, [start, end]),
        this.rds.query(`SELECT COUNT(*) AS cnt FROM shop_inquiries WHERE created_at >= $1 AND created_at < $2`, [start, end]),
        this.rds.query(`SELECT COUNT(*) AS cnt FROM shop_inquiries WHERE status = 'pending'`),
        this.rds.query(`SELECT to_char(snapshot_date,'YYYY-MM-DD') AS snapshot_date, data
                        FROM marketing_snapshots ORDER BY snapshot_date DESC LIMIT 1`)
          .catch(() => ({ rows: [] as Record<string, unknown>[] })),
        this.computePartnerEngagement('yesterday', 'yesterday').catch(() => null),
      ]);

      const snap = mktRes.rows[0] as { snapshot_date: string; data: MarketingSnapshotData } | undefined;
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
        views:        views,
        newUsers:     parseInt(uRows[0].cnt as string, 10),
        newInquiries: parseInt(iRows[0].cnt as string, 10),
        pendingInquiries: parseInt(pRows[0].cnt as string, 10),
        partner,   // { partnerCount, linkedCount, codeCount, views, clicks } | null (어제 기준)
        marketing,
      });
    } catch (err) {
      console.error('[dailyReport]', (err as Error).message);
      res.json({ date: null, views: 0, newUsers: 0, newInquiries: 0, pendingInquiries: 0, partner: null, marketing: null });
    }
  };

  // ── 마케팅 스냅샷: 최근 N일 추세 (카드 클릭 시 그래프용) ──────
  listMarketingTrend = async (req: Request, res: Response): Promise<void> => {
    try {
      const days = Math.min(Math.max(parseInt((req.query.days as string) ?? '30', 10) || 30, 1), 180);
      const { rows } = await this.rds.query(
        `SELECT to_char(snapshot_date, 'YYYY-MM-DD') AS date, data FROM marketing_snapshots
         ORDER BY snapshot_date DESC LIMIT $1`, [days],
      );
      const snapshots = rows.map(r => ({ date: r.date as string, data: r.data }))
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
      const { rows } = date
        ? await this.rds.query(
            `SELECT to_char(snapshot_date,'YYYY-MM-DD') AS date, data FROM marketing_snapshots WHERE snapshot_date = $1 LIMIT 1`, [date])
        : await this.rds.query(
            `SELECT to_char(snapshot_date,'YYYY-MM-DD') AS date, data FROM marketing_snapshots ORDER BY snapshot_date DESC LIMIT 1`);
      const row = rows[0] as { date: string; data: unknown } | undefined;
      res.json({ date: row?.date ?? null, data: row?.data ?? null });
    } catch (err) {
      console.error('[getMarketing]', (err as Error).message);
      res.json({ date: null, data: null });
    }
  };

  // ── 시안 이미지 생성: NVIDIA FLUX → Storage → 스냅샷에 append ──
  generateMarketingImages = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const count = Math.min(Math.max(parseInt(String(req.body?.count ?? 5), 10) || 5, 1), 10);
      const result = await runImageGeneration(this.rds, count);
      res.json(result);
    } catch (err) {
      // 키·레시피 누락은 운영자가 고칠 문제라 원인을 그대로 보여준다
      if (err instanceof ImageGenConfigError) {
        console.error('[generateMarketingImages] config', err.message);
        res.status(503).json({ code: 'IMAGE_GEN_UNAVAILABLE', message: err.message });
        return;
      }
      next(err);
    }
  };

  // ── 시안 이미지 삭제: Storage 객체 + 스냅샷 data.images 동시 제거 ──
  // ── 쓰레드에 직접 답글 등록 ──────────────────────────────────
  threadsReply = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { replyToId, text } = req.body ?? {};
      if (!replyToId || !text?.trim()) {
        res.status(400).json({ code: 'VALIDATION_ERROR', message: 'replyToId와 text가 필요합니다' });
        return;
      }
      const result = await replyToThread(this.rds, String(replyToId), String(text).trim());
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof ThreadsConfigError) {
        res.status(503).json({ code: 'THREADS_UNAVAILABLE', message: err.message });
        return;
      }
      // 쓰레드 API 거부(권한/레이트리밋 등)는 원인 메시지를 그대로 전달
      res.status(502).json({ code: 'THREADS_ERROR', message: (err as Error).message });
    }
  };

  // ── GA4: 개요 (활성 사용자/세션/예약클릭) ────────────────────
  private ga4Handle(res: Response, err: unknown): void {
    if (err instanceof GA4ConfigError) {
      res.status(503).json({ code: 'GA4_UNAVAILABLE', message: err.message });
    } else {
      console.error('[ga4]', (err as Error).message);
      res.status(502).json({ code: 'GA4_ERROR', message: (err as Error).message });
    }
  }

  ga4OverviewHandler = async (req: Request, res: Response): Promise<void> => {
    try {
      const days = Math.min(Math.max(parseInt(String(req.query.days ?? '30'), 10) || 30, 1), 365);
      const data = await this.cachedStats(`ga4:overview:${days}`, () => ga4Overview(days));
      res.json(data);
    } catch (err) { this.ga4Handle(res, err); }
  };

  // 샵 상세조회 Top (GA4 shop_view, 샵명은 Supabase에서 매핑)
  ga4ShopViewsHandler = async (req: Request, res: Response): Promise<void> => {
    try {
      const days = Math.min(Math.max(parseInt(String(req.query.days ?? '30'), 10) || 30, 1), 365);
      const stats = await this.cachedStats(`ga4:shopViews:${days}`, async () => {
        const rows = await ga4TopShops('shop_view', days, 20);
        const shopMap = await fetchShopMap(this.rds, rows.map(r => r.shopId), 'id, name, gu');
        return rows.map(r => ({
          shopId: r.shopId,
          shopName: (shopMap.get(r.shopId)?.name as string) ?? null,
          gu: (shopMap.get(r.shopId)?.gu as string) ?? null,
          views: r.count,
        }));
      });
      res.json({ days, stats });
    } catch (err) { this.ga4Handle(res, err); }
  };

  // 예약클릭 Top + 총합
  ga4ReservationsHandler = async (req: Request, res: Response): Promise<void> => {
    try {
      const days = Math.min(Math.max(parseInt(String(req.query.days ?? '30'), 10) || 30, 1), 365);
      const data = await this.cachedStats(`ga4:reservations:${days}`, async () => {
        const [rows, total] = await Promise.all([
          ga4TopShops('reserve_click', days, 20),
          ga4EventCount('reserve_click', days),
        ]);
        const shopMap = await fetchShopMap(this.rds, rows.map(r => r.shopId), 'id, name, gu');
        return {
          total,
          stats: rows.map(r => ({
            shopId: r.shopId,
            shopName: (shopMap.get(r.shopId)?.name as string) ?? null,
            gu: (shopMap.get(r.shopId)?.gu as string) ?? null,
            clicks: r.count,
          })),
        };
      });
      res.json({ days, ...data });
    } catch (err) { this.ga4Handle(res, err); }
  };

  // 유입 경로 (쓰레드·광고 기여)
  ga4AcquisitionHandler = async (req: Request, res: Response): Promise<void> => {
    try {
      const days = Math.min(Math.max(parseInt(String(req.query.days ?? '30'), 10) || 30, 1), 365);
      const sources = await this.cachedStats(`ga4:acq:${days}`, () => ga4Acquisition(days, 15));
      res.json({ days, sources });
    } catch (err) { this.ga4Handle(res, err); }
  };

  // ── 주제로 새 글 초안 추천 (우리 글 말투 학습) ────────────────
  threadsDraft = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { topic } = req.body ?? {};
      if (!topic?.trim()) {
        res.status(400).json({ code: 'VALIDATION_ERROR', message: 'topic이 필요합니다' });
        return;
      }
      const result = await generateThreadsDraft(this.rds, String(topic).trim());
      res.json(result);
    } catch (err) {
      if (err instanceof ThreadsConfigError) {
        res.status(503).json({ code: 'THREADS_UNAVAILABLE', message: err.message });
        return;
      }
      res.status(502).json({ code: 'THREADS_ERROR', message: (err as Error).message });
    }
  };

  // ── 쓰레드에 새 글 발행 ──────────────────────────────────────
  threadsPost = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { text } = req.body ?? {};
      if (!text?.trim()) {
        res.status(400).json({ code: 'VALIDATION_ERROR', message: 'text가 필요합니다' });
        return;
      }
      const result = await publishThread(this.rds, String(text).trim());
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof ThreadsConfigError) {
        res.status(503).json({ code: 'THREADS_UNAVAILABLE', message: err.message });
        return;
      }
      res.status(502).json({ code: 'THREADS_ERROR', message: (err as Error).message });
    }
  };

  deleteMarketingImage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const imageId = req.params.imageId;
      // 이미지 id는 `YYYY-MM-DD-n` 형식이라 날짜를 유추할 수 있다. 쿼리로 넘어오면 그걸 우선.
      const date = (req.query.date as string | undefined) || imageId.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.status(400).json({ code: 'VALIDATION_ERROR', message: '이미지의 스냅샷 날짜를 확인할 수 없습니다' });
        return;
      }

      const { rows } = await this.rds.query(
        `SELECT data FROM marketing_snapshots WHERE snapshot_date = $1 LIMIT 1`, [date],
      );
      const data = (rows[0]?.data ?? {}) as MarketingSnapshotData;
      const images = data.images ?? [];
      const target = images.find(im => im.id === imageId);
      if (!target) {
        res.status(404).json({ code: 'NOT_FOUND', message: '이미지를 찾을 수 없습니다' });
        return;
      }

      // S3 키 추출 (신규: /api/v1/marketing/img/<key>). 레거시 Supabase URL은 스토리지 삭제 스킵.
      const marker = '/marketing/img/';
      const at = target.url.indexOf(marker);
      if (at >= 0) {
        const key = decodeURIComponent(target.url.slice(at + marker.length));
        await s3Delete(key).catch(e => console.error('[deleteMarketingImage] s3', (e as Error).message, key));
      }

      const nextData: MarketingSnapshotData = { ...data, images: images.filter(im => im.id !== imageId) };
      await this.rds.query(
        `UPDATE marketing_snapshots SET data = $2::jsonb, updated_at = now() WHERE snapshot_date = $1`,
        [date, JSON.stringify(nextData)],
      );

      res.json({ ok: true, id: imageId, remaining: nextData.images!.length });
    } catch (err) {
      next(err);
    }
  };

  // ── 마케팅 이미지 서빙 (S3 presigned로 302 리다이렉트, 공개) ──
  marketingImg = async (req: Request, res: Response): Promise<void> => {
    try {
      const key = `${req.params.date}/${req.params.file}`;
      if (!/^\d{4}-\d{2}-\d{2}\/[\w.-]+$/.test(key)) { res.status(400).end(); return; }
      const url = await s3PresignGet(key, 3600);
      // presigned URL은 1h 후 만료 → 302를 캐시하면 만료 후 깨짐. 매번 새 서명 받도록 no-store.
      res.setHeader('Cache-Control', 'no-store');
      res.redirect(302, url);
    } catch {
      res.status(404).end();
    }
  };

  // ── 내부: 마케팅 스냅샷 upsert (marketing-report 스킬용, X-Internal-Key) ──
  internalMarketingSnapshot = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { date, data } = req.body ?? {};
      if (!data || typeof data !== 'object') {
        res.status(400).json({ code: 'VALIDATION_ERROR', message: 'data(JSON)가 필요합니다' });
        return;
      }
      const d = /^\d{4}-\d{2}-\d{2}$/.test(String(date))
        ? date : new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
      await this.rds.query(
        `INSERT INTO marketing_snapshots (snapshot_date, data, updated_at)
         VALUES ($1, $2::jsonb, now())
         ON CONFLICT (snapshot_date) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
        [d, JSON.stringify(data)],
      );
      res.json({ ok: true, date: d });
    } catch (err) { next(err); }
  };

  // ── 범용 이미지 프록시 (S3 presigned 302, 공개) — 샵 사진 등 ──
  imgProxy = async (req: Request, res: Response): Promise<void> => {
    try {
      const key = ((req.params as unknown as string[])[0] || '').replace(/^\/+/, '');
      if (!/^[\w./-]+$/.test(key) || key.includes('..')) { res.status(400).end(); return; }
      res.setHeader('Cache-Control', 'no-store'); // presigned 302 만료 캐시 방지
      res.redirect(302, await s3PresignGet(key, 3600));
    } catch { res.status(404).end(); }
  };

  // ── 대시보드 요약 (SSE fallback) ─────────────────────────────
  // SSE 폴링과 동일한 계산을 재사용한다 (예전엔 6개 쿼리를 SSE와 복붙 → 드리프트 위험).
  dashboardSummary = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json(await this.sse.buildSummary());
    } catch (err) { next(err); }
  };

  // ── 트렌드 (일별 신규 가입·코드) — 30일 ─────────────────────
  getTrends = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.cachedStats('trends:30d', async () => {
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

      const fmtRows = (rows: Record<string, unknown>[]) =>
        rows.map(r => ({ date: String(r.date).slice(0, 10), count: Number(r.count) }));

      // 뷰 일별 집계는 GA4(shop_view)에서. GA4 실패해도 나머지는 나오게 [].
      const viewDaily = await ga4DailyEventCount('shop_view', 30)
        .then(rows => rows.map(d => ({ date: d.date, count: d.value })))
        .catch(() => [] as { date: string; count: number }[]);

      return {
        users:   fmtRows(userRows),
        owners:  fmtRows(ownerRows),
        codes:   fmtRows(codeRows),
        views:   viewDaily,
      };
      });
      res.json(result);
    } catch (err) { next(err); }
  };
}
