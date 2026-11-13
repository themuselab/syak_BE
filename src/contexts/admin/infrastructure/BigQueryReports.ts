import { GoogleAuth } from 'google-auth-library';
import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { Pool } from 'pg';
import { gaDateRange } from './GA4Funnel';

const project = () => process.env.BIGQUERY_PROJECT_ID || 'syak-c2ee0';
const dataset = 'syak_reporting';
const table = 'ga4_event_daily';
type Daily = { date: string; event: string; count: number; users: number; source?: string };
let auth: GoogleAuth;
function credentials() {
  return JSON.parse(Buffer.from(process.env.GA4_SA_KEY || '', 'base64').toString());
}
async function token() {
  auth ||= new GoogleAuth({ credentials: credentials(), scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  return auth.getAccessToken();
}
async function bq(path: string, body?: unknown, method?: string) {
  const response = await fetch(`https://bigquery.googleapis.com/bigquery/v2/projects/${project()}/${path}`, {
    method: method || (body ? 'POST' : 'GET'),
    headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000),
  });
  const result = await response.json() as any;
  if (!response.ok) throw new Error(`BigQuery ${response.status}: ${result.error?.status || 'request failed'}`);
  return result;
}
export const REPORT_MIGRATION = `CREATE TABLE IF NOT EXISTS ga4_report_archive (
  id integer PRIMARY KEY CHECK (id = 1), rows jsonb NOT NULL, synced_at timestamptz NOT NULL
)`;

export function mergeDaily(previous: Daily[], incoming: Daily[], startDate: string): Daily[] {
  return [...previous.filter(r => r.date < startDate), ...incoming].sort((a, b) => a.date.localeCompare(b.date) || a.event.localeCompare(b.event));
}

export async function loadGaDailyReport(rows: Daily[], syncedAt: string) {
  if (!rows.length || rows.some(r => !/^\d{4}-\d{2}-\d{2}$/.test(r.date) || !r.event || !Number.isSafeInteger(r.count) || r.count < 0 || !Number.isSafeInteger(r.users) || r.users < 0)) {
    throw new Error('Invalid GA daily report');
  }
  const boundary = 'syak_reporting_batch';
  const fields = [
    { name: 'date', type: 'DATE' }, { name: 'event', type: 'STRING' },
    { name: 'count', type: 'INTEGER' }, { name: 'users', type: 'INTEGER' },
    { name: 'synced_at', type: 'TIMESTAMP' },
    { name: 'source', type: 'STRING' },
  ];
  const metadata = { configuration: { load: {
    destinationTable: { projectId: project(), datasetId: dataset, tableId: table },
    sourceFormat: 'NEWLINE_DELIMITED_JSON', writeDisposition: 'WRITE_TRUNCATE', schema: { fields },
  } } };
  const data = rows.map(r => JSON.stringify({ ...r, source: r.source || 'ga4_report', synced_at: syncedAt })).join('\n');
  const response = await fetch(`https://bigquery.googleapis.com/upload/bigquery/v2/projects/${project()}/jobs?uploadType=multipart`, {
    method: 'POST', headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n${data}\r\n--${boundary}--\r\n`,
    signal: AbortSignal.timeout(30000),
  });
  const job = await response.json() as any;
  if (!response.ok) throw new Error(`BigQuery load ${response.status}`);
  for (let i = 0; i < 30; i++) {
    const state = await bq(`jobs/${job.jobReference.jobId}?location=US`);
    if (state.status.errorResult) throw new Error(`BigQuery load: ${state.status.errorResult.reason}`);
    if (state.status.state === 'DONE') {
      // Sandbox tables expire; keep this small aggregate snapshot alive while syncing.
      await bq(`datasets/${dataset}/tables/${table}`, { expirationTime: String(Date.now() + 59 * 86400000) }, 'PATCH');
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error('BigQuery load did not finish');
}

/** One serialized batch per six hours. Durable PostgreSQL archive survives sandbox expiry. */
export async function syncGaReports(pool: Pool, force = false) {
  const db = await pool.connect();
  let locked = false;
  try {
    locked = (await db.query('SELECT pg_try_advisory_lock(544178953) AS locked')).rows[0].locked;
    if (!locked) return;
    await db.query(REPORT_MIGRATION);
    const saved = (await db.query('SELECT rows, synced_at FROM ga4_report_archive WHERE id = 1')).rows[0];
    if (!force && saved && Date.now() - new Date(saved.synced_at).getTime() < 6 * 3600000) return;
    const previous: Daily[] = (saved?.rows || []).filter((r: Daily) => !r.source || r.source === 'ga4_report');
    const latest = previous.map(r => r.date).sort().pop();
    const startDate = latest ? new Date(Date.parse(latest) - 3 * 86400000).toISOString().slice(0, 10) : '2020-01-01';
    const client = new BetaAnalyticsDataClient({ credentials: credentials(), fallback: true });
    const incoming: Daily[] = [];
    try {
      for (let offset = 0; offset < 1000000; offset += 100000) {
        const [report] = await client.runReport({
          property: `properties/${process.env.GA4_PROPERTY_ID}`,
          dateRanges: [{ startDate, endDate: 'today' }],
          dimensions: [{ name: 'date' }, { name: 'eventName' }],
          metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
          orderBys: [{ dimension: { dimensionName: 'date' } }, { dimension: { dimensionName: 'eventName' } }],
          limit: 100000, offset,
        }, { timeout: 60000, retry: null });
        if (Number(report.rowCount) > 1000000) throw new Error('GA report exceeds archive row limit');
        for (const row of report.rows || []) {
          const date = row.dimensionValues?.[0]?.value || '';
          incoming.push({ date: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`,
            event: row.dimensionValues?.[1]?.value || '', count: Number(row.metricValues?.[0]?.value || 0), users: Number(row.metricValues?.[1]?.value || 0) });
        }
        if (offset + 100000 >= Number(report.rowCount || 0)) break;
      }
    } finally { await client.close(); }
    // Empty reports must not erase previously imported history during transient API trouble.
    if (!incoming.length) throw new Error('GA report is empty; existing archive preserved');
    const rows = mergeDaily(previous, incoming, startDate);
    const now = new Date().toISOString();
    await loadGaDailyReport(rows, now);
    await db.query(`INSERT INTO ga4_report_archive(id, rows, synced_at) VALUES (1, $1, $2)
      ON CONFLICT(id) DO UPDATE SET rows = excluded.rows, synced_at = excluded.synced_at`, [JSON.stringify(rows), now]);
    cache.clear();
    return { rows: rows.length, since: rows[0]?.date, latest: rows[rows.length - 1]?.date };
  } finally {
    if (locked) await db.query('SELECT pg_advisory_unlock(544178953)');
    db.release();
  }
}

const cache = new Map<string, { at: number; value: any }>();
export async function bigQueryEventSummary(days: number) {
  if (![0, 1, 7, 28, 30, 90].includes(days)) throw new Error('Invalid report range');
  const range = gaDateRange(days);
  const cacheKey = `${range.startDate}:${range.endDate}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < 300000) return hit.value;
  const query = `SELECT event, SUM(count) count, MIN(date) since, MAX(date) latest,
    MAX(synced_at) synced_at FROM \`${project()}.${dataset}.${table}\`
    WHERE date BETWEEN @start AND @end AND (source = 'ga4_report' OR source IS NULL)
    GROUP BY event ORDER BY count DESC`;
  const report = await bq('queries', { query, useLegacySql: false, location: 'US', timeoutMs: 10000,
    maximumBytesBilled: '100000000', parameterMode: 'NAMED', queryParameters: [
      { name: 'start', parameterType: { type: 'DATE' }, parameterValue: { value: range.startDate } },
      { name: 'end', parameterType: { type: 'DATE' }, parameterValue: { value: range.endDate } },
    ] });
  if (!report.jobComplete || report.pageToken) throw new Error('BigQuery query incomplete');
  const rows = (report.rows || []).map((r: any) => r.f.map((f: any) => f.v));
  const dates = rows.flatMap((r: any) => [r[2], r[3]]).sort();
  const synced = rows[0]?.[4];
  const value = { source: 'GA4 보고서 저장본', days, range,
    events: rows.map((r: any) => ({ event: r[0], count: Number(r[1]) })),
    coverage: { since: dates[0] || null, latest: dates[dates.length - 1] || null, syncedAt: synced ? new Date(Number(synced) * 1000).toISOString() : null },
  };
  if (cache.size > 20) cache.clear();
  cache.set(cacheKey, { at: Date.now(), value });
  return value;
}
