import { Request, Response, NextFunction } from 'express';
import { GeneralShopRefreshService } from '../infrastructure/GeneralShopRefreshService';
import { ShopSyncService } from '../infrastructure/ShopSyncService';
import { PartnerRefreshService, RefreshKind } from '../infrastructure/PartnerRefreshService';

/** 내부용(스크래퍼) — 샵 타깃/메타/요약/today_open. X-Internal-Key 필요 */
export class ShopInternalController {
  constructor(private readonly svc: ShopSyncService, private readonly partnerRefresh: PartnerRefreshService,
    private readonly general: GeneralShopRefreshService) {}

  sourceBackoff = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      let status: number | undefined;
      let seconds: number | undefined;
      if (req.method === 'POST') {
        status = req.body?.status;
        seconds = req.body?.retryAfterSeconds;
        if (!status || ![401,403,429,503].includes(status) || (seconds != null
          && (!Number.isInteger(seconds) || seconds < 0 || seconds > 2147483647))) {
          res.status(400).json({code:'VALIDATION_ERROR'}); return;
        }
      }
      res.set('Cache-Control', 'private, no-store').json(await this.svc.sourceBackoff(status, seconds));
    } catch (e) { next(e); }
  };

  partnerTargets = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const kind = String(req.query.kind ?? 'slots');
      if (!['slots', 'events', 'details'].includes(kind)) { res.status(400).json({ code: 'VALIDATION_ERROR' }); return; }
      const targets = await this.partnerRefresh.targets(kind as RefreshKind, String(req.query.after ?? ''));
      const last = targets[targets.length - 1];
      const refresh = last?.refresh as Record<string, string> | undefined;
      const next = targets.length === 50 ? `v1:${Buffer.from(JSON.stringify({at: refresh?.[kind] ?? '', id: String(last.id)})).toString('base64url')}` : null;
      res.json({ targets, next });
    } catch (err) { next(err); }
  };

  refreshPartner = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id, kind, observedAt, data } = req.body ?? {};
      if (!id || !['slots', 'events', 'details'].includes(kind) || typeof observedAt !== 'string' || !data || typeof data !== 'object') {
        res.status(400).json({ code: 'VALIDATION_ERROR' }); return;
      }
      res.json(await this.partnerRefresh.apply(String(id), kind, observedAt, data));
    } catch (err) { next(err); }
  };

  refreshDailySlots = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id, observedAt, data } = req.body ?? {};
      if (typeof id !== 'string' || !/^\d+$/.test(id) || typeof observedAt !== 'string'
          || !data || typeof data.noticeChecked !== 'boolean'
          || (data.noticeChecked ? !['notice_present', 'notice_not_seen'].includes(data.noticeStatus) : data.noticeStatus != null)) {
        res.status(400).json({ code: 'VALIDATION_ERROR' }); return;
      }
      res.json(await this.partnerRefresh.applyDailySlots(id, observedAt, data));
    } catch (err) { next(err); }
  };

  generalTargets = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const {kind} = req.query;
      const part = Number(req.query.part), limit = Number(req.query.limit ?? 32);
      if ((kind !== 'metadata' && kind !== 'slots') || !Number.isInteger(part) || part<0 || part>=8
          || !Number.isInteger(limit) || limit<1 || limit>80) {
        res.status(400).json({code:'VALIDATION_ERROR'}); return;
      }
      res.set('Cache-Control','private, no-store').json(await this.general.targets(kind,part,limit));
    } catch (error) { next(error); }
  };

  generalRecord = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const {id,kind,observedAt,outcome,data} = req.body ?? {};
      const states = kind==='metadata' ? ['observed','unavailable','category-review'] :
        ['updated','not-eligible','no-calendar','no-booking-item','notice-empty','unavailable'];
      if (!['slots','metadata'].includes(kind) || typeof id!=='string' || !/^\d+$/.test(id)
          || !states.includes(outcome) || typeof observedAt!=='string' || !Number.isFinite(Date.parse(observedAt))
          || Date.parse(observedAt)>Date.now()+60000 || Date.parse(observedAt)<Date.now()-3600000
          || (outcome==='observed' && (!data || data.placeId!==id))) {
        res.status(400).json({code:'VALIDATION_ERROR'}); return;
      }
      res.json(await this.general.record(id,kind,observedAt,outcome,data ?? {}));
    } catch (error) { next(error); }
  };

  generalReserve = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const {source,count} = req.body ?? {};
      if (!['place','booking'].includes(source) || !Number.isInteger(count) || count<1 || count>8) {
        res.status(400).json({code:'VALIDATION_ERROR'}); return;
      }
      res.json(await this.general.reserve(source,count));
    } catch (error) { next(error); }
  };

  catalogAudit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const {batch, version} = req.query;
      if (typeof batch !== 'string' || !/^[a-z0-9-]{1,45}$/.test(batch)
          || (version !== undefined && (typeof version !== 'string' || !/^[0-9a-f]{64}$/.test(version)))) {
        res.status(400).json({code: 'VALIDATION_ERROR'});
        return;
      }
      res.set('Cache-Control','private, no-store').json(await this.svc.catalogAudit(batch,version));
    } catch (err) { next(err); }
  };

  targets = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try { res.json({ targets: await this.svc.getTargets(req.query.legacy === '1') }); } catch (err) { next(err); }
  };

  /** 즐겨찾기된 샵만 (빈자리 알림 고빈도 폴링용) */
  favoriteTargets = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try { res.json({ targets: await this.svc.getFavoriteTargets() }); } catch (err) { next(err); }
  };

  meta = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ids = String(req.query.ids ?? '').split(',').map(s => s.trim()).filter(Boolean);
      res.json({ shops: await this.svc.getMeta(ids) });
    } catch (err) { next(err); }
  };

  summary = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
      const n = await this.svc.updateSummaries(rows);
      res.json({ updated: n });
    } catch (err) { next(err); }
  };

  reconcileTodayOpen = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const date = String(req.body?.date ?? new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10));
      const after = String(req.body?.after ?? '00:00');
      res.json(await this.svc.reconcileTodayOpen(date, after));
    } catch (err) { next(err); }
  };

  seoShops = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const categories = String(req.query.categories ?? '네일')
        .split(',').map(s => s.trim()).filter(Boolean);
      const topN = parseInt(String(req.query.topn ?? '40'), 10) || 40;
      res.json({ categories, shops: await this.svc.getSeoShops(categories, topN) });
    } catch (err) { next(err); }
  };

  priceTargets = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try { res.json({ targets: await this.svc.getPriceTargets(parseInt(String(req.query.limit ?? '300'), 10) || 300) }); }
    catch (err) { next(err); }
  };

  updatePrices = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
      res.json({ updated: await this.svc.updatePrices(rows) });
    } catch (err) { next(err); }
  };

  partnerUnsynced = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try { res.json({ partners: await this.svc.getPartnerUnsynced(parseInt(String(req.query.limit ?? '50'), 10) || 50) }); }
    catch (err) { next(err); }
  };

  enrichShop = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const row = req.body?.shop ?? req.body;
      if (!row?.id) { res.status(400).json({ code: 'VALIDATION_ERROR', message: 'shop.id 필요' }); return; }
      await this.svc.enrichShop(row);
      res.json({ ok: true, id: row.id });
    } catch (err) { next(err); }
  };

  updateEvents = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
      res.json({ updated: await this.svc.updateEvents(rows) });
    } catch (err) { next(err); }
  };

  updateDetails = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
      res.json({ updated: await this.svc.updateDetails(rows) });
    } catch (err) { next(err); }
  };
}
