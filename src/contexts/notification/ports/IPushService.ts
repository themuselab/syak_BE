export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface IPushService {
  send(fcmToken: string, payload: PushPayload): Promise<void>;
  sendBatch(fcmTokens: string[], payload: PushPayload): Promise<void>;
}
