import { GoogleAuth } from 'google-auth-library';
import { Pool } from 'pg';

export function gaDateRange(days: number, now = Date.now()) {
  if (![0, 1, 7, 28, 30, 90].includes(days)) throw new Error('Invalid GA period');
  const today = new Date(now + 9 * 3600000).toISOString().slice(0, 10);
  const end = Date.parse(today) - 86400000;
  return { startDate: days === 0 ? '2026-08-19' : new Date(end - (days - 1) * 86400000).toISOString().slice(0, 10), endDate: new Date(end).toISOString().slice(0, 10) };
}

export function gaFunnelRequest(days: number, shopType: string, now = Date.now()) {
  if (!['all', 'partner', 'general'].includes(shopType)) throw new Error('Invalid shop type');
  const event = (eventName: string, parameters: Record<string, string> = {}) => ({
    funnelEventFilter: { eventName, ...(Object.keys(parameters).length ? {
      funnelParameterFilterExpression: { andGroup: { expressions: Object.entries(parameters).map(([eventParameterName, value]) => ({
        funnelParameterFilter: { eventParameterName, stringFilter: { matchType: 'EXACT', value } },
      })) } },
    } : {}) },
  });
  const type: Record<string, string> = shopType === 'all' ? {} : { shop_type: shopType };
  return { dateRanges: [gaDateRange(days, now)], funnel: { isOpenFunnel: false, steps: [
    { name: '방문', filterExpression: event('session_start') },
    { name: '샵 상세', filterExpression: event('shop_view', type) },
    { name: '네이버 이동', filterExpression: event('reserve_click', { ...type, reservation_method: 'naver' }) },
  ] } };
}

export function parseGaFunnel(report: any) {
  const table = report.funnelTable;
  const headers = table?.metricHeaders?.map((h: any) => h.name) || [];
  const stepIndex = table?.dimensionHeaders?.findIndex((h: any) => h.name === 'funnelStepName');
  if (!table || stepIndex < 0 || !['activeUsers', 'funnelStepCompletionRate', 'funnelStepAbandonments'].every(k => headers.includes(k))) throw new Error('Invalid GA funnel response');
  const rows = table.rows || [];
  const steps = ['방문', '샵 상세', '네이버 이동'].map((name, i) => {
    const row = rows.find((r: any) => r.dimensionValues?.[stepIndex]?.value?.startsWith(`${i + 1}.`));
    if (!row) throw new Error('Incomplete GA funnel response');
    const metric = (key: string) => Number(row.metricValues?.[headers.indexOf(key)]?.value);
    const users = metric('activeUsers'), completionRate = metric('funnelStepCompletionRate'), abandonments = metric('funnelStepAbandonments');
    if (![users, completionRate, abandonments].every(Number.isFinite) || users < 0 || abandonments < 0 || completionRate < 0 || completionRate > 1) throw new Error('Invalid GA funnel metrics');
    return { name, users, completionRate, abandonments };
  });
  if (steps.some((step, i) => i > 0 && step.users > steps[i - 1].users)) throw new Error('Invalid closed funnel');
  return { steps, metadata: table.metadata || {} };
}

let auth: GoogleAuth;
const pending = new Map<string, Promise<any>>();
export async function gaFunnel(pool: Pool, days: number, shopType: string) {
  const body = gaFunnelRequest(days, shopType);
  const range = body.dateRanges[0];
  const property = process.env.GA4_PROPERTY_ID;
  if (!property || !process.env.GA4_SA_KEY) throw new Error('GA4 not configured');
  const key = `${property}:${range.startDate}:${range.endDate}:${shopType}`;
  const running = pending.get(key);
  if (running) return running;
  const work = (async () => {
    await pool.query(`CREATE TABLE IF NOT EXISTS ga4_funnel_cache (cache_key text PRIMARY KEY, report jsonb NOT NULL, fetched_at timestamptz NOT NULL)`);
    const saved = (await pool.query('SELECT report, fetched_at FROM ga4_funnel_cache WHERE cache_key = $1', [key])).rows[0];
    if (saved && Date.now() - new Date(saved.fetched_at).getTime() < 10 * 60000) return { ...saved.report, stale: false };
    try {
      auth ||= new GoogleAuth({ credentials: JSON.parse(Buffer.from(process.env.GA4_SA_KEY!, 'base64').toString()), scopes: ['https://www.googleapis.com/auth/analytics.readonly'] });
      const response = await fetch(`https://analyticsdata.googleapis.com/v1alpha/properties/${property}:runFunnelReport`, {
        method: 'POST', headers: { Authorization: `Bearer ${await auth.getAccessToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(25000),
      });
      if (!response.ok) throw new Error(`GA4 funnel ${response.status}`);
      const parsed = parseGaFunnel(await response.json());
      const value = { ...parsed, source: 'GA4 Funnel API', range, shopType, fetchedAt: new Date().toISOString(), stale: false };
      await pool.query(`INSERT INTO ga4_funnel_cache(cache_key, report, fetched_at) VALUES ($1,$2,now())
        ON CONFLICT(cache_key) DO UPDATE SET report=excluded.report, fetched_at=excluded.fetched_at`, [key, JSON.stringify(value)]);
      await pool.query("DELETE FROM ga4_funnel_cache WHERE fetched_at < now() - interval '30 days'");
      return value;
    } catch (error) {
      if (saved) return { ...saved.report, stale: true };
      throw error;
    }
  })();
  pending.set(key, work);
  try { return await work; } finally { pending.delete(key); }
}
