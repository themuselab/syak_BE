import { Pool } from 'pg';
import { INotificationRepository, DispatchTarget } from '../ports/INotificationRepository';
import { Notification, NotificationType } from '../domain/Notification';
import { NotificationSettings, UpdateNotificationSettingsInput } from '../domain/NotificationSettings';

const HAVERSINE_KM = `
  6371 * acos(
    cos(radians($1)) * cos(radians(ns.near_lat)) *
    cos(radians(ns.near_lng) - radians($2)) +
    sin(radians($1)) * sin(radians(ns.near_lat))
  )
`;

export class PgNotificationRepository implements INotificationRepository {
  constructor(private readonly pool: Pool) {}

  async findTodayByUser(userId: string): Promise<Notification[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM notifications
       WHERE user_id = $1
         AND created_at::date = CURRENT_DATE
       ORDER BY created_at DESC`,
      [userId],
    );
    return rows.map(this.mapNotif);
  }

  async insert(n: Omit<Notification, 'id' | 'readAt' | 'createdAt'>): Promise<Notification> {
    const { rows } = await this.pool.query(
      `INSERT INTO notifications (user_id, shop_id, shop_name, type, slot_time, slot_date)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [n.userId, n.shopId, n.shopName, n.type, n.slotTime, n.slotDate],
    );
    return this.mapNotif(rows[0]);
  }

  async markRead(notificationId: string, userId: string): Promise<void> {
    await this.pool.query(
      `UPDATE notifications SET read_at = NOW()
       WHERE id = $1 AND user_id = $2 AND read_at IS NULL`,
      [notificationId, userId],
    );
  }

  async getSettings(userId: string): Promise<NotificationSettings | null> {
    const { rows } = await this.pool.query(
      'SELECT * FROM notification_settings WHERE user_id = $1',
      [userId],
    );
    return rows[0] ? this.mapSettings(rows[0]) : null;
  }

  async upsertSettings(userId: string, input: UpdateNotificationSettingsInput): Promise<NotificationSettings> {
    const { rows } = await this.pool.query(
      `INSERT INTO notification_settings
         (user_id, near_enabled, near_lat, near_lng, radius_km, favorite_enabled, shop_news_enabled, fcm_token, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         near_enabled      = COALESCE($2, notification_settings.near_enabled),
         near_lat          = COALESCE($3, notification_settings.near_lat),
         near_lng          = COALESCE($4, notification_settings.near_lng),
         radius_km         = COALESCE($5, notification_settings.radius_km),
         favorite_enabled  = COALESCE($6, notification_settings.favorite_enabled),
         shop_news_enabled = COALESCE($7, notification_settings.shop_news_enabled),
         fcm_token         = COALESCE($8, notification_settings.fcm_token),
         updated_at        = NOW()
       RETURNING *`,
      [
        userId,
        input.nearEnabled ?? null,
        input.nearLat ?? null,
        input.nearLng ?? null,
        input.radiusKm ?? null,
        input.favoriteEnabled ?? null,
        input.shopNewsEnabled ?? null,
        input.fcmToken ?? null,
      ],
    );
    return this.mapSettings(rows[0]);
  }

  async findFavoriteTargets(shopId: string): Promise<DispatchTarget[]> {
    const { rows } = await this.pool.query(
      `SELECT u.id AS user_id, ns.fcm_token
       FROM favorites f
       JOIN users u ON u.id = f.user_id
       JOIN notification_settings ns ON ns.user_id = u.id
       WHERE f.shop_id = $1
         AND ns.favorite_enabled = true
         AND ns.fcm_token IS NOT NULL`,
      [shopId],
    );
    return rows.map((r) => ({ userId: r.user_id, fcmToken: r.fcm_token, type: 'favorite' as const }));
  }

  async findNearbyTargets(shopLat: number, shopLng: number): Promise<DispatchTarget[]> {
    const { rows } = await this.pool.query(
      `SELECT u.id AS user_id, ns.fcm_token
       FROM notification_settings ns
       JOIN users u ON u.id = ns.user_id
       WHERE ns.near_enabled = true
         AND ns.near_lat IS NOT NULL
         AND ns.near_lng IS NOT NULL
         AND ns.fcm_token IS NOT NULL
         AND ${HAVERSINE_KM} <= ns.radius_km`,
      [shopLat, shopLng],
    );
    return rows.map((r) => ({ userId: r.user_id, fcmToken: r.fcm_token, type: 'near' as const }));
  }

  private mapNotif(row: Record<string, unknown>): Notification {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      shopId: row.shop_id as string,
      shopName: row.shop_name as string,
      type: row.type as NotificationType,
      slotTime: row.slot_time as string,
      slotDate: row.slot_date as string,
      readAt: row.read_at as Date | null,
      createdAt: row.created_at as Date,
    };
  }

  private mapSettings(row: Record<string, unknown>): NotificationSettings {
    return {
      userId: row.user_id as string,
      nearEnabled: row.near_enabled as boolean,
      nearLat: row.near_lat as number | null,
      nearLng: row.near_lng as number | null,
      radiusKm: row.radius_km as number,
      favoriteEnabled: row.favorite_enabled as boolean,
      shopNewsEnabled: row.shop_news_enabled as boolean,
      fcmToken: row.fcm_token as string | null,
      updatedAt: row.updated_at as Date,
    };
  }
}
