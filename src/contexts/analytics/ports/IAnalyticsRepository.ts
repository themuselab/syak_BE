import { ShopViewEvent, ReservationClickEvent, ShopAnalytics } from '../domain/Analytics';

export interface IAnalyticsRepository {
  recordView(event: ShopViewEvent): Promise<void>;
  recordClick(event: ReservationClickEvent): Promise<void>;
  getShopAnalytics(shopId: string, days: number): Promise<ShopAnalytics>;
}
