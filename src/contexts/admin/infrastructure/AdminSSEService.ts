import { Response } from 'express';
import { Pool } from 'pg';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../../../shared/logger';
import { ga4EventCount } from './GA4Service';

let _instance: AdminSSEService | null = null;
export function getAdminSSE(): AdminSSEService | null { return _instance; }
export function initAdminSSE(rds: Pool, sb: SupabaseClient): AdminSSEService {
  _instance = new AdminSSEService(rds, sb);
  return _instance;
}

export interface AdminSummary {
  users: number;
  owners: number;
  partnerShops: number;
  views7d: number;
  openCodes: number;
  /** 검토 대기 중인 도입 문의 수 — 관리자 종 알림 표시용 */
  pendingInquiries: number;
  ts: string;
}

export class AdminSSEService {
  private clients = new Set<Response>();
  private intervalId: NodeJS.Timeout | null = null;
  private readonly PUSH_INTERVAL_MS = 15_000;

  constructor(private readonly rds: Pool, private readonly sb: SupabaseClient) {}

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

  // 7일 조회수는 GA4에서. SSE는 15초마다 도니 5분 캐시로 GA4 호출을 아낀다.
  private views7dCache = { at: 0, value: 0 };
  private async getViews7d(): Promise<number> {
    if (Date.now() - this.views7dCache.at < 5 * 60_000) return this.views7dCache.value;
    try {
      const v = await ga4EventCount('shop_view', 7);
      this.views7dCache = { at: Date.now(), value: v };
    } catch { /* GA4 실패 시 직전 값 유지 */ }
    return this.views7dCache.value;
  }

  /** 대시보드 요약 계산 — SSE 폴링과 GET /admin/dashboard(fallback)가 공유 */
  async buildSummary(): Promise<AdminSummary> {
    const [
      { rows: uRows },
      { rows: oRows },
      partnerRes,
      { rows: cRows },
      views7d,
      { rows: iRows },
    ] = await Promise.all([
      this.rds.query(`SELECT COUNT(*) AS cnt FROM users`),
      this.rds.query(`SELECT COUNT(*) AS cnt FROM owner_accounts`),
      this.sb.from('shops').select('id', { count: 'exact', head: true }).eq('is_partner', true),
      this.rds.query(`SELECT COUNT(*) AS cnt FROM partner_codes WHERE used = FALSE AND expires_at > NOW()`),
      this.getViews7d(), // GA4 shop_view 7일 (5분 캐시)
      // 종 알림용: 검토 대기 중인 도입 문의
      this.rds.query(`SELECT COUNT(*) AS cnt FROM shop_inquiries WHERE status = 'pending'`),
    ]);

    return {
      users:        parseInt(uRows[0].cnt as string, 10),
      owners:       parseInt(oRows[0].cnt as string, 10),
      partnerShops: partnerRes.count ?? 0,
      views7d:      views7d,
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
