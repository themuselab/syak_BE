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
      const num = (v: unknown) => (v != null ? parseFloat(v as string) : undefined);
      const hasBounds = ['swLat', 'swLng', 'neLat', 'neLng'].every((k) => req.query[k] != null);
      // 지도뷰(bounds)에선 화면 안 샵을 최대한 다 핀으로 → 상한 상향(500). 그 외는 기존 100.
      const maxLimit = hasBounds ? 500 : 100;
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
        lat: num(req.query.lat),
        lng: num(req.query.lng),
        radius: num(req.query.radius),
        swLat: num(req.query.swLat),
        swLng: num(req.query.swLng),
        neLat: num(req.query.neLat),
        neLng: num(req.query.neLng),
        page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
        limit: Math.min(req.query.limit ? parseInt(req.query.limit as string, 10) : 20, maxLimit),
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
