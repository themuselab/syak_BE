import { AppNews, PublishAppNewsInput, RegisterDeviceInput } from '../domain/AppNews';

export interface IAppNewsRepository {
  /** 익명 디바이스 등록/갱신 (device_id upsert) */
  upsertDevice(input: RegisterDeviceInput): Promise<void>;

  /** 전역 앱 소식 최신순 */
  listAppNews(limit: number): Promise<AppNews[]>;

  /** 앱 소식 발행 */
  publishAppNews(input: PublishAppNewsInput): Promise<AppNews>;

  /** 앱 소식 삭제 */
  deleteAppNews(id: string): Promise<void>;

  /** 앱소식 수신 켠 디바이스의 FCM 토큰 목록 (푸시 대상) */
  listAppNewsTokens(): Promise<string[]>;
}
