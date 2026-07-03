import { App, initializeApp, cert, getApps } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { IPushService, PushPayload } from '../ports/IPushService';
import { logger } from '../../../shared/logger';

export class FcmPushService implements IPushService {
  private _app: App | null = null;

  private get app(): App | null {
    if (this._app) return this._app;
    const raw = process.env.FCM_SERVICE_ACCOUNT_JSON ?? '';
    if (!raw) return null;
    try {
      const existing = getApps().find(a => a.name === 'syak');
      if (existing) { this._app = existing; return this._app; }
      const decoded = Buffer.from(raw, 'base64').toString('utf-8');
      const serviceAccount = JSON.parse(decoded) as object;
      this._app = initializeApp({ credential: cert(serviceAccount) }, 'syak');
    } catch (err) {
      logger.warn({ err }, 'FCM init failed — push disabled');
    }
    return this._app;
  }

  async send(fcmToken: string, payload: PushPayload): Promise<void> {
    if (!this.app) { logger.warn('FCM not configured, skipping push'); return; }
    await getMessaging(this.app).send({
      token: fcmToken,
      notification: { title: payload.title, body: payload.body },
      data: payload.data ?? {},
    });
  }

  async sendBatch(fcmTokens: string[], payload: PushPayload): Promise<void> {
    if (!this.app || !fcmTokens.length) return;
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
