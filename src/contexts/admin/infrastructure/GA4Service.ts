import { BetaAnalyticsDataClient } from '@google-analytics/data';

/**
 * GA4 Data API — 관리자 통계를 Supabase events 전량 조회 대신 GA4에서 읽는다.
 *
 * 인증: 서비스 계정 JSON을 base64로 GA4_SA_KEY env에 넣는다(FCM 패턴과 동일).
 *       GA4_PROPERTY_ID = 숫자 속성 ID.
 * 키/ID 없으면 ConfigError → 관리자에서 503 + 안내.
 */

export class GA4ConfigError extends Error {}

let _client: BetaAnalyticsDataClient | null = null;
function client(): BetaAnalyticsDataClient {
  if (_client) return _client;
  const raw = process.env.GA4_SA_KEY;
  if (!raw) throw new GA4ConfigError('GA4_SA_KEY(서비스 계정 base64)가 설정되지 않았습니다');
  let credentials: { client_email: string; private_key: string };
  try {
    credentials = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8'));
  } catch {
    throw new GA4ConfigError('GA4_SA_KEY 디코딩 실패 (base64 JSON 확인)');
  }
  _client = new BetaAnalyticsDataClient({
    credentials: { client_email: credentials.client_email, private_key: credentials.private_key },
  });
  return _client;
}

function property(): string {
  const id = process.env.GA4_PROPERTY_ID;
  if (!id) throw new GA4ConfigError('GA4_PROPERTY_ID가 설정되지 않았습니다');
  return `properties/${id}`;
}

const num = (v: unknown) => Number(v ?? 0) || 0;

export interface DailyPoint { date: string; value: number }

/** YYYYMMDD → YYYY-MM-DD */
const fmtDate = (d: string) => (d?.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d);

/**
 * 개요: 기간 내 활성 사용자(≈MAU/DAU), 세션, 예약클릭 전환.
 * activeUsers를 일자별로 받아 오늘 DAU / 기간 합 등을 계산.
 */
export async function ga4Overview(days = 30): Promise<{
  activeUsersByDay: DailyPoint[];
  totalActiveUsers: number;    // 기간 고유 활성 사용자 (≈ MAU when days=30)
  todayActiveUsers: number;    // 오늘 DAU
  sessions: number;
  reserveClicks: number;
}> {
  const [byDay, totals] = await Promise.all([
    client().runReport({
      property: property(),
      dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
      dimensions: [{ name: 'date' }],
      metrics: [{ name: 'activeUsers' }],
      orderBys: [{ dimension: { dimensionName: 'date' } }],
    }),
    // 기간 전체 집계(고유 활성 사용자·세션은 날짜 합이 아니라 별도 total 필요)
    client().runReport({
      property: property(),
      dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
      metrics: [{ name: 'activeUsers' }, { name: 'sessions' }],
    }),
  ]);

  const activeUsersByDay: DailyPoint[] = (byDay[0].rows ?? []).map(r => ({
    date: fmtDate(r.dimensionValues?.[0]?.value ?? ''),
    value: num(r.metricValues?.[0]?.value),
  }));
  const todayStr = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const todayActiveUsers = activeUsersByDay.find(d => d.date === todayStr)?.value ?? 0;

  const totalRow = totals[0].rows?.[0];
  const totalActiveUsers = num(totalRow?.metricValues?.[0]?.value);
  const sessions = num(totalRow?.metricValues?.[1]?.value);

  // 예약클릭(전환) 수
  const conv = await ga4EventCount('reserve_click', days);
  return { activeUsersByDay, totalActiveUsers, todayActiveUsers, sessions, reserveClicks: conv };
}

/** 특정 이벤트의 기간 총 발생 수 */
export async function ga4EventCount(eventName: string, days = 30): Promise<number> {
  const [res] = await client().runReport({
    property: property(),
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: {
      filter: { fieldName: 'eventName', stringFilter: { value: eventName } },
    },
  });
  return num(res.rows?.[0]?.metricValues?.[0]?.value);
}

/** 이벤트를 shop_id별로 집계 (샵 상세조회/예약클릭 Top). 샵 이름은 호출측에서 매핑 */
export async function ga4TopShops(eventName: string, days = 30, limit = 20): Promise<{ shopId: string; count: number }[]> {
  const [res] = await client().runReport({
    property: property(),
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
    dimensions: [{ name: 'customEvent:shop_id' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: {
      filter: { fieldName: 'eventName', stringFilter: { value: eventName } },
    },
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    limit,
  });
  return (res.rows ?? [])
    .map(r => ({ shopId: r.dimensionValues?.[0]?.value ?? '', count: num(r.metricValues?.[0]?.value) }))
    .filter(r => r.shopId && r.shopId !== '(not set)');
}

/** 유입 경로별 세션 (쓰레드·메타광고 기여 파악) */
export async function ga4Acquisition(days = 30, limit = 15): Promise<{ source: string; sessions: number }[]> {
  const [res] = await client().runReport({
    property: property(),
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
    dimensions: [{ name: 'sessionSource' }],
    metrics: [{ name: 'sessions' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit,
  });
  return (res.rows ?? []).map(r => ({
    source: r.dimensionValues?.[0]?.value ?? '(direct)',
    sessions: num(r.metricValues?.[0]?.value),
  }));
}
