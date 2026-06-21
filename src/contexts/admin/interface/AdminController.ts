import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { Pool } from 'pg';
import { Errors } from '../../../shared/errors/AppError';
import { initAdminSSE, AdminSSEService } from '../infrastructure/AdminSSEService';

// snake_case DB 컬럼명 → camelCase 변환
function toCamel(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())] = v;
  }
  return out;
}
const mapRows = (rows: Record<string, unknown>[]) => rows.map(toCamel);

export class AdminController {
  public readonly sse: AdminSSEService;

  constructor(private readonly rds: Pool, private readonly supabase: Pool) {
    this.sse = initAdminSSE(rds);
  }

  // ── SSE 스트림 (관리자 대시보드 실시간) ──────────────────────────
  stream = (req: Request, res: Response): void => {
    this.sse.addClient(res);
  };

  // ── 관리자 로그인 ─────────────────────────────────────────────
  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password } = req.body as { email?: string; password?: string };
      if (!email || !password) {
        return next(Errors.validation({ email: '이메일과 비밀번호를 입력해주세요' }));
      }
      if (email !== process.env.ADMIN_EMAIL || password !== process.env.ADMIN_PASSWORD) {
        return next(Errors.adminUnauthorized());
      }
      const sessionToken = process.env.ADMIN_SESSION_TOKEN ?? crypto.randomBytes(32).toString('hex');
      res.cookie('syak_admin', sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
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
        SELECT o.id, o.nickname, o.profile_image, o.shop_id, o.created_at,
               s.name AS shop_name, s.gu AS shop_gu
        FROM owner_accounts o
        LEFT JOIN shops s ON s.id = o.shop_id
        ORDER BY o.created_at DESC
        LIMIT 200
      `);
      res.json({ owners: mapRows(rows) });
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
      if (!shopId) {
        return next(Errors.validation({ shopId: 'shopId가 필요합니다' }));
      }
      const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let code: string;
      let attempts = 0;
      do {
        code = Array.from({ length: 8 }, () => CHARSET[Math.floor(Math.random() * CHARSET.length)]).join('');
        const { rows } = await this.rds.query(`SELECT 1 FROM partner_codes WHERE code = $1`, [code]);
        if (!rows.length) break;
      } while (++attempts < 10);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const { rows } = await this.rds.query(
        `INSERT INTO partner_codes (code, shop_id, expires_at) VALUES ($1, $2, $3) RETURNING code, expires_at`,
        [code!, shopId, expiresAt],
      );
      void this.sse.pushNow();
      res.status(201).json({ code: rows[0].code, expiresAt: rows[0].expires_at });
    } catch (err) { next(err); }
  };

  // ── 파트너샵 목록 (연동 완료) ─────────────────────────────────
  listPartnerShops = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { rows } = await this.supabase.query(`
        SELECT s.id, s.name, s.gu, s.category, s.today_open,
               o.id AS owner_id, o.nickname AS owner_nickname
        FROM shops s
        INNER JOIN owner_accounts o ON o.shop_id = s.id
        ORDER BY s.name
        LIMIT 500
      `);
      res.json({ shops: mapRows(rows) });
    } catch (err) { next(err); }
  };

  // ── 전체 샵 현황 ──────────────────────────────────────────────
  listAllShops = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = parseInt(req.query.page as string ?? '1', 10);
      const limit = 50;
      const offset = (page - 1) * limit;
      const { rows } = await this.supabase.query(
        `SELECT id, name, gu, category, today_open FROM shops ORDER BY name LIMIT $1 OFFSET $2`,
        [limit, offset],
      );
      const { rows: [{ count }] } = await this.supabase.query(`SELECT COUNT(*) FROM shops`);
      res.json({ shops: mapRows(rows), total: parseInt(count, 10), page, limit });
    } catch (err) { next(err); }
  };

  // ── 소비자 가입자 목록 ────────────────────────────────────────
  listUsers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = parseInt(req.query.page as string ?? '1', 10);
      const limit = 50;
      const offset = (page - 1) * limit;
      const { rows } = await this.rds.query(
        `SELECT u.id, u.nickname, u.profile_image, u.created_at,
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

  // ── 통계: 샵별 조회 수 ────────────────────────────────────────
  shopViewStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const period = req.query.period === '30d' ? 30 : 7;
      const { rows } = await this.rds.query(`
        SELECT e.shop_id, s.name AS shop_name, s.gu,
               COUNT(*) AS views
        FROM shop_view_events e
        LEFT JOIN shops s ON s.id = e.shop_id
        WHERE e.viewed_at >= NOW() - INTERVAL '${period} days'
        GROUP BY e.shop_id, s.name, s.gu
        ORDER BY views DESC
        LIMIT 100
      `);
      res.json({ period: `${period}d`, stats: mapRows(rows) });
    } catch (err) { next(err); }
  };

  // ── 통계: 취소석 신청 건수 ────────────────────────────────────
  cancelRequestStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const period = req.query.period === '30d' ? 30 : 7;
      const { rows } = await this.rds.query(`
        SELECT DATE(created_at) AS date, COUNT(*) AS count
        FROM notifications
        WHERE type = 'slot_open' AND created_at >= NOW() - INTERVAL '${period} days'
        GROUP BY DATE(created_at)
        ORDER BY date
      `);
      const { rows: [{ total }] } = await this.rds.query(
        `SELECT COUNT(*) AS total FROM notifications WHERE type = 'slot_open' AND created_at >= NOW() - INTERVAL '${period} days'`
      );
      res.json({ period: `${period}d`, daily: rows, total: parseInt(total, 10) });
    } catch (err) { next(err); }
  };

  // ── 통계: 파트너샵 전환율 ─────────────────────────────────────
  partnerConversionStats = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { rows } = await this.rds.query(`
        SELECT
          o.shop_id,
          s.name AS shop_name,
          COUNT(DISTINCT e.id)   AS views_7d,
          COUNT(DISTINCT sl.id)  AS owner_slots_total
        FROM owner_accounts o
        LEFT JOIN shops s ON s.id = o.shop_id
        LEFT JOIN shop_view_events e ON e.shop_id = o.shop_id AND e.viewed_at >= NOW() - INTERVAL '7 days'
        LEFT JOIN slots sl ON sl.shop_id = o.shop_id AND sl.source = 'owner'
        WHERE o.shop_id IS NOT NULL
        GROUP BY o.shop_id, s.name
        ORDER BY views_7d DESC
      `);
      res.json({ stats: mapRows(rows) });
    } catch (err) { next(err); }
  };

  // ── 사용자 상태 변경 (정지/차단) AD-007 ──────────────────────
  updateUserStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { status } = req.body as { status?: string };
      if (status !== 'active' && status !== 'banned') {
        return next(Errors.validation({ status: 'active 또는 banned 값이 필요합니다' }));
      }
      await this.rds.query('UPDATE users SET status = $2 WHERE id = $1', [req.params.userId, status]);
      res.json({ ok: true });
    } catch (err) { next(err); }
  };

  // ── 통계: 예약 버튼 클릭 수 AD-003 ──────────────────────────
  reservationClickStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const period = req.query.period === '30d' ? 30 : 7;
      const { rows } = await this.rds.query(`
        SELECT e.shop_id, s.name AS shop_name, s.gu,
               COUNT(*) AS clicks
        FROM reservation_click_events e
        LEFT JOIN shops s ON s.id = e.shop_id
        WHERE e.clicked_at >= NOW() - INTERVAL '${period} days'
        GROUP BY e.shop_id, s.name, s.gu
        ORDER BY clicks DESC
        LIMIT 100
      `);
      res.json({ period: `${period}d`, stats: mapRows(rows) });
    } catch (err) { next(err); }
  };

  // ── 샵 도입 문의 목록 (SO-000a → AD-008) ─────────────────────
  listInquiries = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const status = (req.query.status as string) ?? 'pending';
      const { rows } = await this.rds.query(
        `SELECT id, shop_name, contact, gu, category, note, status, created_at, reviewed_at
         FROM shop_inquiries
         WHERE status = $1
         ORDER BY created_at DESC
         LIMIT 100`,
        [status],
      );
      res.json({ inquiries: mapRows(rows) });
    } catch (err) { next(err); }
  };

  // ── 샵 도입 문의 상태 변경 (approved | rejected) ─────────────
  updateInquiry = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { status } = req.body as { status?: string };
      if (status !== 'approved' && status !== 'rejected') {
        return next(Errors.validation({ status: 'approved 또는 rejected 값이 필요합니다' }));
      }
      const { rowCount } = await this.rds.query(
        `UPDATE shop_inquiries SET status = $2, reviewed_at = NOW() WHERE id = $1`,
        [req.params.inquiryId, status],
      );
      if (!rowCount) return next(Errors.notFound({ inquiryId: req.params.inquiryId }));
      res.json({ ok: true });
    } catch (err) { next(err); }
  };

  // ── 파트너샵 직접 등록 (AD-008) — Supabase에 기록 ────────────
  createShop = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { name, gu, category, minPrice, lat, lng, bizId } =
        req.body as {
          name?: string; gu?: string; category?: string;
          minPrice?: number; lat?: number; lng?: number; bizId?: string;
        };
      if (!name || !gu || !category) {
        return next(Errors.validation({ name: 'name, gu, category는 필수입니다' }));
      }
      const { rows } = await this.supabase.query(
        `INSERT INTO shops (name, gu, category, categories, min_price, lat, lng, biz_id, is_partner, today_open)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, false)
         RETURNING id, name, gu, category, is_partner`,
        [name, gu, category, JSON.stringify([category]), minPrice ?? null, lat ?? null, lng ?? null, bizId ?? null],
      );
      res.status(201).json(mapRows(rows)[0]);
    } catch (err) { next(err); }
  };

  // ── 파트너샵 정보 수정 (AD-009) ──────────────────────────────
  updateShop = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const fields: string[] = [];
      const params: unknown[] = [req.params.shopId];
      const add = (col: string, val: unknown) => {
        params.push(val);
        fields.push(`${col} = $${params.length}`);
      };
      const body = req.body as Record<string, unknown>;
      if (body.name       !== undefined) add('name', body.name);
      if (body.gu         !== undefined) add('gu', body.gu);
      if (body.category   !== undefined) add('category', body.category);
      if (body.minPrice   !== undefined) add('min_price', body.minPrice);
      if (body.lat        !== undefined) add('lat', body.lat);
      if (body.lng        !== undefined) add('lng', body.lng);
      if (body.bizId      !== undefined) add('biz_id', body.bizId);
      if (body.isPartner  !== undefined) add('is_partner', body.isPartner);
      if (!fields.length) return next(Errors.validation({ fields: '변경할 필드가 없습니다' }));
      const { rowCount } = await this.supabase.query(
        `UPDATE shops SET ${fields.join(', ')} WHERE id = $1`,
        params,
      );
      if (!rowCount) return next(Errors.notFound({ shopId: req.params.shopId }));
      res.json({ ok: true });
    } catch (err) { next(err); }
  };

  // ── 파트너샵 삭제 (AD-009) ───────────────────────────────────
  deleteShop = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { rowCount } = await this.supabase.query(
        'DELETE FROM shops WHERE id = $1',
        [req.params.shopId],
      );
      if (!rowCount) return next(Errors.notFound({ shopId: req.params.shopId }));
      res.status(204).send();
    } catch (err) { next(err); }
  };

  // ── 대시보드 요약 (SSE fallback) ─────────────────────────────
  dashboardSummary = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const [[{ user_count }], [{ owner_count }], [{ partner_shop_count }], [{ views_7d }], [{ open_codes }]] =
        await Promise.all([
          this.rds.query(`SELECT COUNT(*) AS user_count FROM users`).then(r => r.rows),
          this.rds.query(`SELECT COUNT(*) AS owner_count FROM owner_accounts`).then(r => r.rows),
          this.rds.query(`SELECT COUNT(*) AS partner_shop_count FROM owner_accounts WHERE shop_id IS NOT NULL`).then(r => r.rows),
          this.rds.query(`SELECT COUNT(*) AS views_7d FROM shop_view_events WHERE viewed_at >= NOW() - INTERVAL '7 days'`).then(r => r.rows),
          this.rds.query(`SELECT COUNT(*) AS open_codes FROM partner_codes WHERE used = FALSE AND expires_at > NOW()`).then(r => r.rows),
        ]);
      res.json({
        users:        parseInt(user_count as string, 10),
        owners:       parseInt(owner_count as string, 10),
        partnerShops: parseInt(partner_shop_count as string, 10),
        views7d:      parseInt(views_7d as string, 10),
        openCodes:    parseInt(open_codes as string, 10),
      });
    } catch (err) { next(err); }
  };
}
