import { Request, Response, NextFunction } from 'express';
import { GetShopSlotsUseCase } from '../application/GetShopSlotsUseCase';
import { SearchAvailableSlotsUseCase } from '../application/SearchAvailableSlotsUseCase';

export class ReservationController {
  constructor(
    private readonly getShopSlots: GetShopSlotsUseCase,
    private readonly searchSlots: SearchAvailableSlotsUseCase,
  ) {}

  shopSlots = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const dates = req.query.dates
        ? (req.query.dates as string).split(',')
        : undefined;
      const slots = await this.getShopSlots.execute(req.params.shopId, dates);
      res.json({ slots });
    } catch (err) {
      next(err);
    }
  };

  search = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const dates = req.query.dates ? (req.query.dates as string).split(',') : [];
      const times = req.query.times ? (req.query.times as string).split(',') : [];
      const districts = req.query.districts
        ? (req.query.districts as string).split(',')
        : undefined;
      const result = await this.searchSlots.execute({ dates, times, districts });
      res.json({ shops: result, count: result.length });
    } catch (err) {
      next(err);
    }
  };
}
