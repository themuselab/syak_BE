/** 전역 앱 소식(공지/마케팅) — 로그인 여부와 무관하게 알림 탭에 노출 */
export interface AppNews {
  id: string;
  title: string;
  body: string;
  link: string | null;
  imageUrl: string | null;
  publishedAt: Date;
}

export interface PublishAppNewsInput {
  title: string;
  body: string;
  link?: string | null;
  imageUrl?: string | null;
}

/** 익명 디바이스 등록(설치 단위) — 앱소식 수신용 FCM 토큰 */
export interface RegisterDeviceInput {
  deviceId: string;
  fcmToken: string;
  platform?: string | null;
  appNewsEnabled?: boolean;
  userId?: string | null;
}
