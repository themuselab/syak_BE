import { Client } from 'pg';
import { logger } from '../logger';
import { DispatchSlotNotificationsUseCase, SlotEvent } from '../../contexts/notification/application/DispatchSlotNotificationsUseCase';

export class SlotListener {
  private client: Client | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly dispatch: DispatchSlotNotificationsUseCase) {}

  async start(): Promise<void> {
    await this.connect();
  }

  async stop(): Promise<void> {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.client) {
      await this.client.end().catch(() => undefined);
      this.client = null;
    }
  }

  private async connect(): Promise<void> {
    // LISTEN requires a dedicated client (not pool)
    // Supabase 직접 연결 필수 — PgBouncer 풀러는 LISTEN/NOTIFY 미지원
    this.client = new Client({
      connectionString: process.env.SUPABASE_DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });

    try {
      await this.client.connect();
      await this.client.query('LISTEN slot_inserted');
      logger.info('SlotListener connected — real-time slot notifications active');

      this.client.on('notification', (msg) => {
        if (msg.channel !== 'slot_inserted' || !msg.payload) return;
        this.handleNotification(msg.payload);
      });

      this.client.on('error', (err) => {
        logger.error({ err }, 'SlotListener pg client error — reconnecting in 5s');
        this.scheduleReconnect();
      });

      this.client.on('end', () => {
        logger.warn('SlotListener connection closed — reconnecting in 5s');
        this.scheduleReconnect();
      });
    } catch (err) {
      logger.error({ err }, 'SlotListener failed to connect — retrying in 5s');
      this.scheduleReconnect();
    }
  }

  private handleNotification(payload: string): void {
    let event: SlotEvent;
    try {
      event = JSON.parse(payload) as SlotEvent;
    } catch {
      logger.warn({ payload }, 'SlotListener received invalid JSON payload');
      return;
    }

    logger.info({ shopId: event.shopId, slotTime: event.slotTime }, 'Slot inserted — dispatching push');

    this.dispatch.execute([event]).then(({ dispatched }) => {
      logger.info({ shopId: event.shopId, dispatched }, 'Push dispatch complete');
    }).catch((err) => {
      logger.error({ err, shopId: event.shopId }, 'Push dispatch failed');
    });
  }

  private scheduleReconnect(): void {
    if (this.client) {
      this.client.end().catch(() => undefined);
      this.client = null;
    }
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(() => undefined);
    }, 5000);
  }
}
