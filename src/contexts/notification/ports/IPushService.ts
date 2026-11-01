export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface IPushService {
  /**
   * 단건 발송. true = 푸시 서비스(Expo)가 메시지를 접수함(ticket status 'ok').
   * 접수 ≠ 기기 도달: Expo는 APNs/FCM 으로 넘긴 것까지만 보장한다(docs/13-tracking.md).
   */
  send(fcmToken: string, payload: PushPayload): Promise<boolean>;
  sendBatch(fcmTokens: string[], payload: PushPayload): Promise<void>;
}
