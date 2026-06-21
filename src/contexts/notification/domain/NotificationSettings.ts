export interface NotificationSettings {
  userId: string;
  nearEnabled: boolean;
  nearLat: number | null;
  nearLng: number | null;
  radiusKm: number;
  favoriteEnabled: boolean;
  shopNewsEnabled: boolean;
  fcmToken: string | null;
  updatedAt: Date;
}

export type UpdateNotificationSettingsInput = Partial<Omit<NotificationSettings, 'userId' | 'updatedAt'>>;
