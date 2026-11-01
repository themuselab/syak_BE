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
  /** 한 샵의 안 읽은 알림 전부 읽음 — 푸시 탭/샵 상세 진입 시 */
  markShopRead(shopId: string, userId: string): Promise<void>;
  /** 푸시 서비스(Expo)가 접수한 시각 기록(pushed_at) */
  markPushed(notificationId: string): Promise<void>;
  /** 푸시 탭으로 열림 — opened_at·read_at 이 비어 있을 때만 채움(멱등) */
  markOpened(notificationId: string, userId: string): Promise<void>;

  getSettings(userId: string): Promise<NotificationSettings | null>;
  upsertSettings(userId: string, input: UpdateNotificationSettingsInput): Promise<NotificationSettings>;

  findFavoriteTargets(shopId: string): Promise<DispatchTarget[]>;
  findNearbyTargets(shopLat: number, shopLng: number): Promise<DispatchTarget[]>;
}
