import { Request, Response, NextFunction } from 'express';
import { ShopSyncService } from '../infrastructure/ShopSyncService';

/** 내부용(스크래퍼) — 샵 타깃/메타/요약/today_open. X-Internal-Key 필요 */
export class ShopInternalController {
  constructor(private readonly svc: ShopSyncService) {}

  targets = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try { res.json({ targets: await this.svc.getTargets() }); } catch (err) { next(err); }
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
}
