export interface NotificationSettings {
  userId: string;
  nearEnabled: boolean;
  nearLat: number | null;
  nearLng: number | null;
  radiusKm: number;
  /** 관심 동네(사용자가 직접 고른 행정동 묶음, 예 "역삼동"). near_lat/lng = 그 동네 중심.
   *  GPS가 아니라 사용자가 지정한 지역이라 개인위치정보가 아니다(2026-10-27 관심 동네 도입). */
  regionCode: string | null;
  regionName: string | null;
  favoriteEnabled: boolean;
  shopNewsEnabled: boolean;
  fcmToken: string | null;
  updatedAt: Date;
}

export type UpdateNotificationSettingsInput = Partial<Omit<NotificationSettings, 'userId' | 'updatedAt'>>;
