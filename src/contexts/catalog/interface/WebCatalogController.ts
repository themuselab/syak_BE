import { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';

/**
 * 소비자 웹 전용 raw 카탈로그 API (RDS). 웹이 Supabase REST를 직접 호출하던 것을
 * 백엔드 경유로 바꾸기 위해, 웹이 기대하는 raw 컬럼 형태를 그대로 반환한다.
 * (웹의 매핑 코드는 변경 없이 fetch 대상만 교체)
 */
const SUMMARY_COLS =
  'id, name, category, categories, gu, lat, lng, representative_image, review_count, price_tier, min_price, first_visit_deal, has_event, reservable, services, event_desc, event_price, is_partner, pilot_coupon, today_open';
const PIN_COLS = 'id, name, category, gu, lat, lng, event_desc, event_price, is_partner, today_open';
const DETAIL_COLS = 'detail, services, event_desc, event_price, biz_id, biz_type, is_partner, pilot_coupon, pilot_hours, today_open';

const num = (v: unknown, d: number) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

export class WebCatalogController {
  constructor(private readonly rds: Pool) {}

  // ── 샵 ────────────────────────────────────────────────────────
  inBounds = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { swLat, swLng, neLat, neLng } = req.query;
      const limit = Math.min(num(req.query.limit, 600), 2000);
      const { rows } = await this.rds.query(
        `SELECT ${SUMMARY_COLS} FROM shops
         WHERE lat BETWEEN $1 AND $2 AND lng BETWEEN $3 AND $4
         ORDER BY review_count DESC NULLS LAST LIMIT $5`,
        [num(swLat, -90), num(neLat, 90), num(swLng, -180), num(neLng, 180), limit],
      );
      res.json(rows);
    } catch (err) { next(err); }
  };

  pins = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { swLat, swLng, neLat, neLng } = req.query;
      const limit = Math.min(num(req.query.limit, 5000), 8000);
      const { rows } = await this.rds.query(
        `SELECT ${PIN_COLS} FROM shops
         WHERE lat BETWEEN $1 AND $2 AND lng BETWEEN $3 AND $4
         ORDER BY review_count DESC NULLS LAST LIMIT $5`,
        [num(swLat, -90), num(neLat, 90), num(swLng, -180), num(neLng, 180), limit],
      );
      res.json(rows);
    } catch (err) { next(err); }
  };

  byGus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const gus = String(req.query.gus ?? '').split(',').map(s => s.trim()).filter(Boolean);
      const limit = Math.min(num(req.query.limit, 600), 2000);
      if (!gus.length) { res.json([]); return; }
      const { rows } = await this.rds.query(
        `SELECT ${SUMMARY_COLS} FROM shops WHERE gu = ANY($1::text[])
         ORDER BY review_count DESC NULLS LAST LIMIT $2`,
        [gus, limit],
      );
      res.json(rows);
    } catch (err) { next(err); }
  };

  partners = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const limit = Math.min(num(req.query.limit, 200), 1000);
      const { rows } = await this.rds.query(
        `SELECT ${SUMMARY_COLS} FROM shops WHERE is_partner = true
         ORDER BY review_count DESC NULLS LAST LIMIT $1`, [limit],
      );
      res.json(rows);
    } catch (err) { next(err); }
  };

  search = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const q = String(req.query.q ?? '').trim();
      if (!q) { res.json([]); return; }
      const { rows } = await this.rds.query(
        `SELECT ${SUMMARY_COLS} FROM shops WHERE name ILIKE $1
         ORDER BY review_count DESC NULLS LAST LIMIT 30`, [`%${q}%`],
      );
      res.json(rows);
    } catch (err) { next(err); }
  };

  detail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { rows } = await this.rds.query(
        `SELECT ${DETAIL_COLS} FROM shops WHERE id = $1`, [req.params.shopId],
      );
      res.json(rows); // 웹은 배열에서 [0]을 취함
    } catch (err) { next(err); }
  };

  // ── 슬롯 (RDS, scraper/owner 통합) ────────────────────────────
  shopSlots = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const shopId = String(req.query.shopId ?? '');
      const date = String(req.query.date ?? '');
      if (!shopId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { res.json([]); return; }
      const { rows } = await this.rds.query(
        `SELECT to_char(start_time,'HH24:MI:SS') AS start_time FROM slots
         WHERE shop_id = $1 AND date = $2::date AND source IN ('scraper','owner')
           AND (status IS NULL OR status NOT IN ('reserved','expired'))
         ORDER BY start_time`,
        [shopId, date],
      );
      res.json(rows);
    } catch (err) { next(err); }
  };

  // ── 취소석 알림 신청 (leads, RDS) ────────────────────────────
  registerLead = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { phone, district, category } = req.body ?? {};
      if (!phone || typeof phone !== 'string') {
        res.status(400).json({ code: 'VALIDATION_ERROR', message: '전화번호가 필요합니다' });
        return;
      }
      await this.rds.query(
        `INSERT INTO leads (phone, district, category, kind) VALUES ($1, $2, $3, 'missed_seat_alert')`,
        [phone.trim(), district ?? null, category ?? null],
      );
      res.status(201).json({ ok: true });
    } catch (err) { next(err); }
  };

  shopsOpenAt = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const date = String(req.query.date ?? '');
      let hour = String(req.query.hour ?? '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !hour) { res.json([]); return; }
      if (hour.length === 5) hour = `${hour}:00`;
      const h = Number(hour.slice(0, 2));
      const to = `${String((h + 1) % 24).padStart(2, '0')}:00:00`;
      const { rows } = await this.rds.query(
        `SELECT DISTINCT shop_id FROM slots
         WHERE date = $1::date AND start_time >= $2::time AND start_time < $3::time
           AND source IN ('scraper','owner') AND (status IS NULL OR status NOT IN ('reserved','expired'))`,
        [date, hour, to],
      );
      res.json(rows);
    } catch (err) { next(err); }
  };
}
