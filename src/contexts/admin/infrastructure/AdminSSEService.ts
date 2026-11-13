import { Response } from 'express';
import { Pool } from 'pg';
import { logger } from '../../../shared/logger';

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
  openCodes: number;
  /** 검토 대기 중인 도입 문의 수 — 관리자 종 알림 표시용 */
  pendingInquiries: number;
  ts: string;
}

export class AdminSSEService {
  private clients = new Set<Response>();
  private intervalId: NodeJS.Timeout | null = null;
  private readonly PUSH_INTERVAL_MS = 15_000;

  constructor(private readonly rds: Pool) {}

  addClient(res: Response): void {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    this.clients.add(res);
    logger.info({ total: this.clients.size }, 'admin SSE client connected');

    if (this.clients.size === 1) this.startPolling();
    this.buildSummary().then(data => this.sendTo(res, data)).catch(() => {});

    res.on('close', () => {
      this.clients.delete(res);
      logger.info({ total: this.clients.size }, 'admin SSE client disconnected');
      if (this.clients.size === 0) this.stopPolling();
    });
  }

  private startPolling(): void {
    this.intervalId = setInterval(async () => {
      try { this.broadcast(await this.buildSummary()); }
      catch (err) { logger.warn({ err }, 'admin SSE poll failed'); }
    }, this.PUSH_INTERVAL_MS);
  }

  private stopPolling(): void {
    if (this.intervalId) { clearInterval(this.intervalId); this.intervalId = null; }
  }

  async pushNow(): Promise<void> {
    try { this.broadcast(await this.buildSummary()); }
    catch (err) { logger.warn({ err }, 'admin SSE pushNow failed'); }
  }

  /** 대시보드 요약 계산 — SSE 폴링과 GET /admin/dashboard(fallback)가 공유 */
  async buildSummary(): Promise<AdminSummary> {
    const [
      { rows: uRows },
      { rows: oRows },
      { rows: pRows },
      { rows: cRows },
      { rows: iRows },
    ] = await Promise.all([
      this.rds.query(`SELECT COUNT(*) AS cnt FROM users`),
      this.rds.query(`SELECT COUNT(*) AS cnt FROM owner_accounts`),
      this.rds.query(`SELECT COUNT(*) AS cnt FROM shops WHERE is_partner = true`),
      this.rds.query(`SELECT COUNT(*) AS cnt FROM partner_codes WHERE used = FALSE AND expires_at > NOW()`),
      // 종 알림용: 검토 대기 중인 도입 문의
      this.rds.query(`SELECT COUNT(*) AS cnt FROM shop_inquiries WHERE status = 'pending'`),
    ]);

    return {
      users:        parseInt(uRows[0].cnt as string, 10),
      owners:       parseInt(oRows[0].cnt as string, 10),
      partnerShops: parseInt(pRows[0].cnt as string, 10),
      openCodes:    parseInt(cRows[0].cnt as string, 10),
      pendingInquiries: parseInt(iRows[0].cnt as string, 10),
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
