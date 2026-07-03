import { App, initializeApp, cert, getApps } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { IPushService, PushPayload } from '../ports/IPushService';
import { logger } from '../../../shared/logger';

export class FcmPushService implements IPushService {
  private readonly app: App;

  constructor() {
    const existing = getApps().find(a => a.name === 'syak');
    if (existing) {
      this.app = existing;
    } else {
      const raw = process.env.FCM_SERVICE_ACCOUNT_JSON ?? '';
      const decoded = Buffer.isBuffer(raw)
        ? raw.toString()
        : Buffer.from(raw, 'base64').toString('utf-8');
      const serviceAccount = JSON.parse(decoded);
      this.app = initializeApp({ credential: cert(serviceAccount) }, 'syak');
    }
  }

  async send(fcmToken: string, payload: PushPayload): Promise<void> {
    await getMessaging(this.app).send({
      token: fcmToken,
      notification: { title: payload.title, body: payload.body },
      data: payload.data ?? {},
    });
  }

  async sendBatch(fcmTokens: string[], payload: PushPayload): Promise<void> {
    if (!fcmTokens.length) return;
    for (const batch of chunk(fcmTokens, 500)) {
      try {
        const res = await getMessaging(this.app).sendEachForMulticast({
          tokens: batch,
          notification: { title: payload.title, body: payload.body },
          data: payload.data ?? {},
        });
        if (res.failureCount > 0) {
          logger.warn({ failureCount: res.failureCount }, 'FCM batch: some tokens failed');
        }
      } catch (err) {
        logger.error({ err }, 'FCM batch send failed');
      }
    }
  }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
