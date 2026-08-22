import {
  CostExplorerClient, GetCostAndUsageCommand,
} from '@aws-sdk/client-cost-explorer';
import { FreeTierClient, GetFreeTierUsageCommand } from '@aws-sdk/client-freetier';

/**
 * AWS 이번 달 비용(MTD) — Cost Explorer.
 *
 * 자격증명: EC2 인스턴스 역할(권장) 또는 env AWS_ACCESS_KEY_ID/SECRET (기본 provider chain).
 * 필요 권한: ce:GetCostAndUsage. Cost Explorer는 콘솔에서 최초 1회 활성화 필요(~24h).
 * 없으면 AwsCostConfigError → 관리자에서 안내.
 * 참고: Cost Explorer API는 호출당 $0.01 → 컨트롤러에서 캐시.
 */
export class AwsCostConfigError extends Error {}

let _client: CostExplorerClient | null = null;
function client(): CostExplorerClient {
  // Cost Explorer는 글로벌 — us-east-1 고정
  if (!_client) _client = new CostExplorerClient({ region: 'us-east-1' });
  return _client;
}

const fmtDate = (d: Date) => d.toISOString().slice(0, 10);

export interface AwsCost {
  monthToDate: number;
  currency: string;
  periodStart: string;
  periodEnd: string;   // 오늘(포함) 기준
  byService: { service: string; amount: number }[];
}

/** /admin/aws-cost 응답 — 비용/프리티어 각각 독립적으로 성공/실패 */
export interface AwsCostResponse {
  cost: AwsCost | null;
  costError: string | null;
  freeTier: FreeTierItem[] | null;
  freeTierError: string | null;
}

export async function awsMonthToDate(): Promise<AwsCost> {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(now.getTime() + 24 * 3600 * 1000); // 오늘 포함(End는 exclusive)

  let res;
  try {
    res = await client().send(new GetCostAndUsageCommand({
      TimePeriod: { Start: fmtDate(start), End: fmtDate(end) },
      Granularity: 'MONTHLY',
      Metrics: ['UnblendedCost'],
      GroupBy: [{ Type: 'DIMENSION', Key: 'SERVICE' }],
    }));
  } catch (err) {
    const name = (err as Error).name || '';
    if (/Credential|Token|AccessDenied|UnrecognizedClient|DataUnavailable/i.test(name + (err as Error).message)) {
      throw new AwsCostConfigError('AWS 비용 조회 권한/자격증명이 없습니다 (ce:GetCostAndUsage · Cost Explorer 활성화 확인)');
    }
    throw err;
  }

  const groups = (res.ResultsByTime ?? []).flatMap(t => t.Groups ?? []);
  let total = 0;
  let currency = 'USD';
  const byService = groups.map(g => {
    const amt = g.Metrics?.UnblendedCost;
    const value = Number(amt?.Amount ?? 0) || 0;
    if (amt?.Unit) currency = amt.Unit;
    total += value;
    return { service: g.Keys?.[0] ?? '기타', amount: value };
  })
    .filter(s => s.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 6);

  return {
    monthToDate: total,
    currency,
    periodStart: fmtDate(start),
    periodEnd: fmtDate(now),
    byService,
  };
}

// ── 프리티어 잔여 ────────────────────────────────────────────────
let _ft: FreeTierClient | null = null;
function ftClient(): FreeTierClient {
  if (!_ft) _ft = new FreeTierClient({ region: 'us-east-1' }); // FreeTier는 us-east-1만
  return _ft;
}

export interface FreeTierItem {
  service: string;
  description: string;
  unit: string;
  used: number;
  limit: number;
  remaining: number;
  percent: number;          // 사용률 (실사용/한도)
  forecastPercent: number;  // 월말 예상 사용률
  freeTierType: string;
}

export async function awsFreeTier(): Promise<FreeTierItem[]> {
  const raw: import('@aws-sdk/client-freetier').FreeTierUsage[] = [];
  try {
    let nextToken: string | undefined;
    do {
      const res = await ftClient().send(new GetFreeTierUsageCommand({ maxResults: 100, nextToken }));
      raw.push(...(res.freeTierUsages ?? []));
      nextToken = res.nextToken;
    } while (nextToken);
  } catch (err) {
    const msg = ((err as Error).name || '') + (err as Error).message;
    if (/Credential|Token|AccessDenied|UnrecognizedClient|DataUnavailable/i.test(msg)) {
      throw new AwsCostConfigError('프리티어 조회 권한/자격증명이 없습니다 (freetier:GetFreeTierUsage)');
    }
    throw err;
  }

  return raw
    .map(u => {
      const limit = Number(u.limit ?? 0) || 0;
      const used = Number(u.actualUsageAmount ?? 0) || 0;
      const forecast = Number(u.forecastedUsageAmount ?? 0) || 0;
      return {
        service: shortService(u.service ?? ''),
        description: u.description ?? u.usageType ?? '',
        unit: u.unit ?? '',
        used,
        limit,
        remaining: Math.max(0, limit - used),
        percent: limit ? Math.min(100, Math.round((used / limit) * 100)) : 0,
        forecastPercent: limit ? Math.round((forecast / limit) * 100) : 0,
        freeTierType: u.freeTierType ?? '',
      };
    })
    .filter(i => i.limit > 0)
    .sort((a, b) => b.percent - a.percent)
    .slice(0, 10);
}

/** 'Amazon Elastic Compute Cloud' → 'EC2' 류로 축약(길면 그대로) */
function shortService(s: string): string {
  return s
    .replace(/^Amazon\s+/, '').replace(/^AWS\s+/, '')
    .replace('Elastic Compute Cloud', 'EC2')
    .replace('Simple Storage Service', 'S3')
    .replace('Relational Database Service', 'RDS')
    .replace('Elastic Load Balancing', 'ELB');
}
