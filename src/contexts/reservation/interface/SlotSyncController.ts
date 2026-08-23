import { Request, Response, NextFunction } from 'express';
import { SyncScraperSlotsUseCase } from '../application/SyncScraperSlotsUseCase';
import { GetOpenNowShopsUseCase } from '../application/GetOpenNowShopsUseCase';
import { Slot } from '../domain/Slot';

/** 내부용(스크래퍼) — 슬롯 동기화 + 초록핀 재계산. X-Internal-Key 필요 */
export class SlotSyncController {
  constructor(
    private readonly sync: SyncScraperSlotsUseCase,
    private readonly openNow: GetOpenNowShopsUseCase,
  ) {}

  openNowHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const date = (req.query.date as string) ?? new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
      const after = (req.query.after as string) ?? '00:00';
      const shopIds = await this.openNow.execute(date, after);
      res.json({ shopIds });
    } catch (err) { next(err); }
  };

  handle = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { startDate, endDate } = req.body ?? {};
      const shopIds: string[] = Array.isArray(req.body?.shopIds) ? req.body.shopIds.map(String) : [];
      const rawSlots: Record<string, unknown>[] = Array.isArray(req.body?.slots) ? req.body.slots : [];
      if (!startDate || !endDate) {
        res.status(400).json({ code: 'VALIDATION_ERROR', message: 'startDate/endDate가 필요합니다' });
        return;
      }
      const slots: Slot[] = rawSlots.map(s => ({
        shopId:    String(s.shopId ?? s.shop_id),
        date:      String(s.date ?? s.slot_date),
        startTime: String(s.startTime ?? s.start_time).slice(0, 5),
      })).filter(s => s.shopId && /^\d{4}-\d{2}-\d{2}$/.test(s.date) && /^\d{2}:\d{2}$/.test(s.startTime));

      const result = await this.sync.execute({ startDate, endDate, shopIds, slots });
      res.json({ inserted: result.inserted, newCount: result.newSlots.length, newSlots: result.newSlots });
    } catch (err) { next(err); }
  };
}
