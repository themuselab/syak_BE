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
}
