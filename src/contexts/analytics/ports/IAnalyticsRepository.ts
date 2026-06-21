import { ShopViewEvent, ShopAnalytics } from '../domain/Analytics';

export interface IAnalyticsRepository {
  recordView(event: ShopViewEvent): Promise<void>;
  getShopAnalytics(shopId: string, days: number): Promise<ShopAnalytics>;
}
