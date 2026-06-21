import { Pool } from 'pg';
import { IAnalyticsRepository } from '../ports/IAnalyticsRepository';
import { ShopViewEvent, ShopAnalytics } from '../domain/Analytics';

export class PgAnalyticsRepository implements IAnalyticsRepository {
  constructor(private readonly pool: Pool) {}

  async recordView(event: ShopViewEvent): Promise<void> {
    await this.pool.query(
      'INSERT INTO shop_view_events (shop_id, user_id) VALUES ($1, $2)',
      [event.shopId, event.userId],
    );
  }

  async getShopAnalytics(shopId: string, days: number): Promise<ShopAnalytics> {
    const [viewsRes, slotsRes] = await Promise.all([
      this.pool.query(
        `SELECT
           date_trunc('day', viewed_at AT TIME ZONE 'Asia/Seoul')::date::text AS date,
           COUNT(*)::int AS views
         FROM shop_view_events
         WHERE shop_id = $1
           AND viewed_at >= now() - ($2 || ' days')::interval
         GROUP BY 1
         ORDER BY 1`,
        [shopId, days],
      ),
      this.pool.query(
        `SELECT
           COUNT(*)::int                                              AS total_slots,
           COUNT(*) FILTER (WHERE date = CURRENT_DATE)::int          AS today_slots
         FROM slots
         WHERE shop_id = $1`,
        [shopId],
      ),
    ]);

    const dailyViews = viewsRes.rows.map((r) => ({ date: r.date as string, views: r.views as number }));
    const totalViews = dailyViews.reduce((s, r) => s + r.views, 0);
    const { total_slots, today_slots } = slotsRes.rows[0] ?? { total_slots: 0, today_slots: 0 };

    return {
      shopId,
      period:     `${days}d`,
      totalViews,
      dailyViews,
      totalSlots: total_slots as number,
      todaySlots: today_slots as number,
    };
  }
}
