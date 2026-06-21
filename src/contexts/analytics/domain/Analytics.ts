export interface ShopViewEvent {
  shopId: string;
  userId: string | null;
}

export interface DailyViewCount {
  date: string;
  views: number;
}

export interface ShopAnalytics {
  shopId: string;
  period: string;
  totalViews: number;
  dailyViews: DailyViewCount[];
  totalSlots: number;
  todaySlots: number;
}
