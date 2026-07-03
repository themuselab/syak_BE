import { Request, Response, NextFunction } from 'express';
import { GetShopsUseCase } from '../application/GetShopsUseCase';
import { GetShopDetailUseCase } from '../application/GetShopDetailUseCase';
import { Category, PriceTier } from '../domain/Shop';
import { SortOrder } from '../domain/ShopFilter';
import { RecordShopViewUseCase } from '../../analytics/application/RecordShopViewUseCase';
import { RecordReservationClickUseCase } from '../../analytics/application/RecordReservationClickUseCase';

export class CatalogController {
  constructor(
    private readonly getShops: GetShopsUseCase,
    private readonly getShopDetail: GetShopDetailUseCase,
    private readonly recordView?: RecordShopViewUseCase,
    private readonly recordClick?: RecordReservationClickUseCase,
  ) {}

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.getShops.execute({
        q: req.query.q as string | undefined,
        region: req.query.region as string | undefined,
        sort: req.query.sort as SortOrder | undefined,
        categories: req.query.categories
          ? (req.query.categories as string).split(',') as Category[]
          : undefined,
        districts: req.query.districts
          ? (req.query.districts as string).split(',')
          : undefined,
        priceTiers: req.query.price_tiers
          ? (req.query.price_tiers as string).split(',') as PriceTier[]
          : undefined,
        hasEvent: req.query.has_event === 'true',
        hasSlot: req.query.has_slot === 'true',
        availableWithinDays: req.query.available_within_days
          ? parseInt(req.query.available_within_days as string, 10)
          : undefined,
        slotDate: req.query.slot_date as string | undefined,
        slotTime: req.query.slot_time as string | undefined,
        lat: req.query.lat ? parseFloat(req.query.lat as string) : undefined,
        lng: req.query.lng ? parseFloat(req.query.lng as string) : undefined,
        radius: req.query.radius ? parseFloat(req.query.radius as string) : undefined,
        page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
        limit: Math.min(req.query.limit ? parseInt(req.query.limit as string, 10) : 20, 100),
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  detail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const shop = await this.getShopDetail.execute(req.params.shopId);
      // fire-and-forget: 조회 이벤트 기록 (실패해도 응답에 영향 없음)
      if (this.recordView) {
        void this.recordView.execute({ shopId: req.params.shopId, userId: req.user?.sub ?? null });
      }
      res.json(shop);
    } catch (err) {
      next(err);
    }
  };

  reservationClick = (req: Request, res: Response): void => {
    if (this.recordClick) {
      void this.recordClick.execute({ shopId: req.params.shopId, userId: req.user?.sub ?? null });
    }
    res.status(204).send();
  };
}
