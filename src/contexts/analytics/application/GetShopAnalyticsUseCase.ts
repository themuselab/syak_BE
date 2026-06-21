import { IAnalyticsRepository } from '../ports/IAnalyticsRepository';
import { ShopAnalytics } from '../domain/Analytics';
import { Errors } from '../../../shared/errors/AppError';

const ALLOWED_PERIODS = ['7d', '30d'] as const;
type Period = typeof ALLOWED_PERIODS[number];

export class GetShopAnalyticsUseCase {
  constructor(private readonly repo: IAnalyticsRepository) {}

  async execute(shopId: string, period: string = '7d'): Promise<ShopAnalytics> {
    if (!ALLOWED_PERIODS.includes(period as Period)) {
      throw Errors.validation({ period: '7d 또는 30d만 허용됩니다' });
    }
    const days = period === '30d' ? 30 : 7;
    return this.repo.getShopAnalytics(shopId, days);
  }
}
