import { Request, Response, NextFunction } from 'express';
import { GetShopAnalyticsUseCase } from '../application/GetShopAnalyticsUseCase';

export class AnalyticsController {
  constructor(private readonly getStats: GetShopAnalyticsUseCase) {}

  getShopStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const shopId = req.owner!.shopId!;
      const period = (req.query.period as string) ?? '7d';
      const stats = await this.getStats.execute(shopId, period);
      res.json(stats);
    } catch (err) {
      next(err);
    }
  };
}
