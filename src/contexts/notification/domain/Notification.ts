export type NotificationType = 'favorite' | 'near';

export interface Notification {
  id: string;
  userId: string;
  shopId: string;
  shopName: string;
  type: NotificationType;
  slotTime: string;
  slotDate: string;
  readAt: Date | null;
  createdAt: Date;
}
