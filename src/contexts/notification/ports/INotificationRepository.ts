import { Notification } from '../domain/Notification';
import { NotificationSettings, UpdateNotificationSettingsInput } from '../domain/NotificationSettings';

export interface DispatchTarget {
  userId: string;
  fcmToken: string;
  type: 'favorite' | 'near';
}

export interface INotificationRepository {
  findTodayByUser(userId: string): Promise<Notification[]>;
  insert(n: Omit<Notification, 'id' | 'readAt' | 'createdAt'>): Promise<Notification>;
  markRead(notificationId: string, userId: string): Promise<void>;

  getSettings(userId: string): Promise<NotificationSettings | null>;
  upsertSettings(userId: string, input: UpdateNotificationSettingsInput): Promise<NotificationSettings>;

  findFavoriteTargets(shopId: string): Promise<DispatchTarget[]>;
  findNearbyTargets(shopLat: number, shopLng: number): Promise<DispatchTarget[]>;
}
