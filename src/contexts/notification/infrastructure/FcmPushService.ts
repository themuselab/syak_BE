import axios from 'axios';
import { IPushService, PushPayload } from '../ports/IPushService';
import { logger } from '../../../shared/logger';

export class FcmPushService implements IPushService {
  private readonly serverKey: string;
  private readonly endpoint = 'https://fcm.googleapis.com/fcm/send';

  constructor() {
    this.serverKey = process.env.FCM_SERVER_KEY ?? '';
  }

  async send(fcmToken: string, payload: PushPayload): Promise<void> {
    await axios.post(
      this.endpoint,
      { to: fcmToken, notification: { title: payload.title, body: payload.body }, data: payload.data },
      { headers: { Authorization: `key=${this.serverKey}`, 'Content-Type': 'application/json' } },
    );
  }

  async sendBatch(fcmTokens: string[], payload: PushPayload): Promise<void> {
    if (!fcmTokens.length) return;
    const batches = chunk(fcmTokens, 500);
    for (const batch of batches) {
      try {
        await axios.post(
          this.endpoint,
          { registration_ids: batch, notification: { title: payload.title, body: payload.body }, data: payload.data },
          { headers: { Authorization: `key=${this.serverKey}`, 'Content-Type': 'application/json' } },
        );
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
