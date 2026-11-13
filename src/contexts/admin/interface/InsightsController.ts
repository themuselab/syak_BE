import { Request, Response, NextFunction } from "express";
import { Pool } from "pg";
import { EXPLORER_SCHEMA, runExplorer } from "../infrastructure/QueryExplorer";
import { internalFunnel } from "../infrastructure/FunnelService";
import { bigQueryEventSummary } from "../infrastructure/BigQueryReports";

export class InsightsController {
  private buckets = new Map<string, { at: number; n: number }>();
  constructor(private readonly pool: Pool) {}
  private limit(key: string, max: number) {
    const now = Date.now();
    if (this.buckets.size > 10000) this.buckets.clear();
    const b = this.buckets.get(key);
    if (!b || now - b.at > 60000) {
      this.buckets.set(key, { at: now, n: 1 });
      return true;
    }
    return ++b.n <= max;
  }
  schema = (_req: Request, res: Response) => {
    res.json({ tables: EXPLORER_SCHEMA });
  };
  query = async (req: Request, res: Response) => {
    if (!this.limit("admin-query", 30)) {
      res.status(429).json({ message: "잠시 뒤 다시 조회해 주세요." });
      return;
    }
    try {
      res.json(await runExplorer(this.pool, String(req.body.sql ?? "")));
    } catch (e) {
      const code = (e as { code?: string }).code;
      res
        .status(400)
        .json({
          message: code
            ? code === "57014"
              ? "조회가 3초를 넘었어요. 조건을 좁혀 주세요."
              : "조회할 수 없는 SQL입니다. 컬럼과 조건을 확인해 주세요."
            : (e as Error).message,
        });
    }
  };
  funnel = async (req: Request, res: Response, next: NextFunction) => {
    const days = Number(req.query.days ?? 7),
      platform = String(req.query.platform ?? "all");
    if (
      ![1, 7, 30, 90].includes(days) ||
      !["all", "web", "ios", "android", "toss"].includes(platform)
    ) {
      res.status(400).json({ message: "기간 또는 플랫폼을 확인해 주세요." });
      return;
    }
    try {
      res.json(await internalFunnel(this.pool, days, platform));
    } catch (e) {
      next(e);
    }
  };
  ga = async (req: Request, res: Response) => {
    const days = Number(req.query.days ?? 7);
    if (![0, 1, 7, 30, 90].includes(days)) {
      res.status(400).json({ message: "기간을 확인해 주세요." });
      return;
    }
    try {
      res.json(await bigQueryEventSummary(days));
    } catch {
      res
        .status(503)
        .json({ message: "BigQuery 집계를 준비 중이거나 조회에 실패했어요. 잠시 뒤 다시 확인해 주세요." });
    }
  };
  integrations = (_req: Request, res: Response) => {
    res.json({
      clarityProjectId: process.env.CLARITY_PROJECT_ID ?? 'zd1l2cqi0i',
      ga4Configured: !!(process.env.GA4_SA_KEY && process.env.GA4_PROPERTY_ID),
    });
  };
  collect = async (req: Request, res: Response, next: NextFunction) => {
    if (!this.limit(`collect:${req.ip}`, 300)) {
      res.sendStatus(429);
      return;
    }
    const input = req.body.events;
    if (!Array.isArray(input) || input.length < 1 || input.length > 20) {
      res.sendStatus(400);
      return;
    }
    const accepted = [];
    for (const e of input) {
      if (
        !e ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(e.event_id ?? "") ||
        !/^[a-zA-Z0-9_-]{10,100}$/.test(e.session_id ?? "") ||
        !/^[a-z][a-z0-9_]{0,59}$/.test(e.event_name ?? "") ||
        !["web", "ios", "android", "toss"].includes(e.platform)
      ) {
        res.sendStatus(400);
        return;
      }
      const ts = Number(e.ts);
      if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > 86400000) {
        res.sendStatus(400);
        return;
      }
      accepted.push({
        event_id: e.event_id,
        session_id: e.session_id,
        event_name: e.event_name,
        platform: e.platform,
        shop_id: /^\d{1,20}$/.test(e.shop_id ?? "") ? String(e.shop_id) : null,
        shop_type: ["partner", "general"].includes(e.shop_type)
          ? e.shop_type
          : null,
        reservation_method: ["naver", "phone", "kakao", "website"].includes(
          e.reservation_method,
        )
          ? e.reservation_method
          : null,
        occurred_at: new Date(ts).toISOString(),
      });
    }
    try {
      await this.pool.query(
        `INSERT INTO analytics_events (event_id,session_id,event_name,platform,shop_id,shop_type,reservation_method,occurred_at)
        SELECT event_id::uuid,session_id,event_name,platform,shop_id,shop_type,reservation_method,occurred_at::timestamptz
        FROM jsonb_to_recordset($1::jsonb) AS e(event_id text,session_id text,event_name text,platform text,shop_id text,shop_type text,reservation_method text,occurred_at text)
        ON CONFLICT (event_id) DO NOTHING`,
        [JSON.stringify(accepted)],
      );
      res.sendStatus(204);
    } catch (e) {
      next(e);
    }
  };
}
