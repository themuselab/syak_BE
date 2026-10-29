/** alert = 빈자리 알림 신청(slot_alerts) 매칭 */
export type NotificationType = 'favorite' | 'near' | 'alert';

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
