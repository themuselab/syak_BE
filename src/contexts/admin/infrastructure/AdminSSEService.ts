import { Response } from 'express';
import { Pool } from 'pg';
import { logger } from '../../../shared/logger';

// 전역 싱글턴 — composition-root에서 initialize() 후 어디서든 push() 가능
let _instance: AdminSSEService | null = null;
export function getAdminSSE(): AdminSSEService | null { return _instance; }
export function initAdminSSE(rds: Pool): AdminSSEService {
  _instance = new AdminSSEService(rds);
  return _instance;
}

export interface AdminSummary {
  users: number;
  owners: number;
  partnerShops: number;
  views7d: number;
  openCodes: number;
  ts: string;
}

export class AdminSSEService {
  private clients = new Set<Response>();
  private intervalId: NodeJS.Timeout | null = null;
  private readonly PUSH_INTERVAL_MS = 15_000; // 15초마다 갱신

  constructor(private readonly rds: Pool) {}

  addClient(res: Response): void {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // nginx 버퍼 비활성화
    res.flushHeaders();

    this.clients.add(res);
    logger.info({ total: this.clients.size }, 'admin SSE client connected');

    if (this.clients.size === 1) this.startPolling();

    // 연결 직후 즉시 1회 전송
    this.buildSummary().then(data => this.sendTo(res, data)).catch(() => {});

    res.on('close', () => {
      this.clients.delete(res);
      logger.info({ total: this.clients.size }, 'admin SSE client disconnected');
      if (this.clients.size === 0) this.stopPolling();
    });
  }

  private startPolling(): void {
    this.intervalId = setInterval(async () => {
      try {
        const data = await this.buildSummary();
        this.broadcast(data);
      } catch (err) {
        logger.warn({ err }, 'admin SSE poll failed');
      }
    }, this.PUSH_INTERVAL_MS);
  }

  private stopPolling(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /** 외부에서 즉시 push 트리거 (사장님 로그인·코드 사용 등 이벤트 발생 시) */
  async pushNow(): Promise<void> {
    try {
      const data = await this.buildSummary();
      this.broadcast(data);
    } catch (err) {
      logger.warn({ err }, 'admin SSE pushNow failed');
    }
  }

  private async buildSummary(): Promise<AdminSummary> {
    const [[{ user_count }], [{ owner_count }], [{ partner_shop_count }], [{ views_7d }], [{ open_codes }]] =
      await Promise.all([
        this.rds.query(`SELECT COUNT(*) AS user_count FROM users`).then(r => r.rows),
        this.rds.query(`SELECT COUNT(*) AS owner_count FROM owner_accounts`).then(r => r.rows),
        this.rds.query(`SELECT COUNT(*) AS partner_shop_count FROM owner_accounts WHERE shop_id IS NOT NULL`).then(r => r.rows),
        this.rds.query(`SELECT COUNT(*) AS views_7d FROM shop_view_events WHERE viewed_at >= NOW() - INTERVAL '7 days'`).then(r => r.rows),
        this.rds.query(`SELECT COUNT(*) AS open_codes FROM partner_codes WHERE used = FALSE AND expires_at > NOW()`).then(r => r.rows),
      ]);
    return {
      users:        parseInt(user_count  as string, 10),
      owners:       parseInt(owner_count as string, 10),
      partnerShops: parseInt(partner_shop_count as string, 10),
      views7d:      parseInt(views_7d   as string, 10),
      openCodes:    parseInt(open_codes as string, 10),
      ts:           new Date().toISOString(),
    };
  }

  private broadcast(data: AdminSummary): void {
    const msg = `data: ${JSON.stringify(data)}\n\n`;
    for (const client of this.clients) {
      try { client.write(msg); } catch { this.clients.delete(client); }
    }
  }

  private sendTo(res: Response, data: AdminSummary): void {
    try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch { this.clients.delete(res); }
  }
}
