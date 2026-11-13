import { Request, Response, NextFunction } from "express";
import { Pool } from "pg";
import { EXPLORER_SCHEMA, runExplorer } from "../infrastructure/QueryExplorer";
import { gaFunnel } from "../infrastructure/GA4Funnel";
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
  funnel = async (req: Request, res: Response) => {
    const days = Number(req.query.days ?? 7),
      shopType = String(req.query.shopType ?? "all");
    if (
      ![0, 1, 7, 28, 30, 90].includes(days) ||
      !["all", "partner", "general"].includes(shopType)
    ) {
      res.status(400).json({ message: "기간 또는 샵 유형을 확인해 주세요." });
      return;
    }
    try {
      res.json(await gaFunnel(this.pool, days, shopType));
    } catch {
      res.status(503).json({ message: "GA 퍼널 응답이 지연되고 있어요. 잠시 뒤 다시 조회해 주세요." });
    }
  };
  ga = async (req: Request, res: Response) => {
    const days = Number(req.query.days ?? 7);
    if (![0, 1, 7, 28, 30, 90].includes(days)) {
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
  // Old cached clients may still send this request. Acknowledge without collecting.
  collect = (_req: Request, res: Response) => { res.sendStatus(204); };
}
