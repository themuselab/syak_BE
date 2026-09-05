import { IPushService, PushPayload } from '../ports/IPushService';
import { logger } from '../../../shared/logger';

// Expo Push로 발송(소비자 앱이 RNFirebase→expo-notifications로 전환됨). 토큰은 "ExponentPushToken[...]".
// Expo가 iOS(APNs)·Android(FCM) 배달을 대행 — 배달 자격증명은 EAS 프로젝트 credentials에 있어야 함
// (iOS: APNs .p8, Android: FCM). 백엔드는 exp.host에 토큰+내용만 POST한다.
// 저장 필드는 기존 fcm_token 재사용(값만 Expo 토큰). 구 FCM 토큰은 형식이 달라 걸러낸다(전환기).
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

function isExpoToken(token: string): boolean {
  return token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken[');
}

type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  data: Record<string, string>;
  sound: 'default';
};

export class ExpoPushService implements IPushService {
  async send(token: string, payload: PushPayload): Promise<void> {
    if (!isExpoToken(token)) return;
    await this.post([this.toMessage(token, payload)]);
  }

  async sendBatch(tokens: string[], payload: PushPayload): Promise<void> {
    const valid = tokens.filter(isExpoToken);
    if (!valid.length) return;
    for (const batch of chunk(valid, 100)) {
      await this.post(batch.map((t) => this.toMessage(t, payload)));
    }
  }

  private toMessage(to: string, p: PushPayload): ExpoMessage {
    return { to, title: p.title, body: p.body, data: p.data ?? {}, sound: 'default' };
  }

  private async post(messages: ExpoMessage[]): Promise<void> {
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(messages),
      });
      if (!res.ok) {
        logger.warn({ status: res.status }, 'Expo push: non-OK response');
        return;
      }
      const json = (await res.json()) as { data?: Array<{ status: string; message?: string }> };
      const errors = (json.data ?? []).filter((t) => t.status === 'error');
      if (errors.length) logger.warn({ errors }, 'Expo push: some tickets errored');
    } catch (err) {
      logger.error({ err }, 'Expo push send failed');
    }
  }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
