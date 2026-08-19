#!/usr/bin/env node
/**
 * GA4 일일 지표를 디스코드로 보낸다.
 *   node scripts/marketing/ga4-discord.mjs
 *
 * env: GA4_PROPERTY_ID, GA4_SA_KEY(서비스계정 JSON base64), DISCORD_WEBHOOK_APP
 * (GA4 SDK는 백엔드에 이미 설치돼 있음 — @google-analytics/data)
 */
import { BetaAnalyticsDataClient } from '@google-analytics/data';

const PROPERTY = `properties/${process.env.GA4_PROPERTY_ID}`;
const WEBHOOK = process.env.DISCORD_WEBHOOK_APP;
const SA = process.env.GA4_SA_KEY;

if (!process.env.GA4_PROPERTY_ID || !SA) { console.error('❌ GA4_PROPERTY_ID / GA4_SA_KEY 필요'); process.exit(1); }

const cred = JSON.parse(Buffer.from(SA, 'base64').toString('utf-8'));
const client = new BetaAnalyticsDataClient({
  credentials: { client_email: cred.client_email, private_key: cred.private_key },
});
const num = v => Number(v ?? 0) || 0;

/** 단일 지표(선택적으로 이벤트명 필터) */
async function metric(metricName, { start, end = 'today', event } = {}) {
  const [res] = await client.runReport({
    property: PROPERTY,
    dateRanges: [{ startDate: start, endDate: end }],
    metrics: [{ name: metricName }],
    ...(event ? { dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { value: event } } } } : {}),
  });
  return num(res.rows?.[0]?.metricValues?.[0]?.value);
}

/** 차원별 상위 N */
async function top(dimension, metricName, { start, end = 'today', event, limit = 5 } = {}) {
  const [res] = await client.runReport({
    property: PROPERTY,
    dateRanges: [{ startDate: start, endDate: end }],
    dimensions: [{ name: dimension }],
    metrics: [{ name: metricName }],
    ...(event ? { dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { value: event } } } } : {}),
    orderBys: [{ metric: { metricName }, desc: true }],
    limit,
  });
  return (res.rows ?? []).map(r => ({ key: r.dimensionValues?.[0]?.value ?? '(없음)', value: num(r.metricValues?.[0]?.value) }));
}

const YtoD = { start: 'yesterday', end: 'yesterday' };

const [
  yUsers, ySessions, yReserve,
  w7Users, w7Reserve,
  m30Users, m30Reserve, m30Views,
  topShops, acq,
] = await Promise.all([
  metric('activeUsers', YtoD),
  metric('sessions', YtoD),
  metric('eventCount', { ...YtoD, event: 'reserve_click' }),
  metric('activeUsers', { start: '7daysAgo' }),
  metric('eventCount', { start: '7daysAgo', event: 'reserve_click' }),
  metric('activeUsers', { start: '30daysAgo' }),
  metric('eventCount', { start: '30daysAgo', event: 'reserve_click' }),
  metric('eventCount', { start: '30daysAgo', event: 'shop_view' }),
  top('customEvent:shop_id', 'eventCount', { start: '7daysAgo', event: 'shop_view', limit: 5 }),
  top('sessionSource', 'sessions', { start: '7daysAgo', limit: 5 }),
]);

const convRate = m30Views ? ((m30Reserve / m30Views) * 100).toFixed(1) + '%' : '-';

// 샵 이름 매핑 시도(Supabase). 실패(정지 등)하면 shop_id 그대로.
let names = {};
try {
  const ids = topShops.map(s => s.key).filter(x => x && x !== '(없음)' && x !== '(not set)');
  if (ids.length && process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY) {
    const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/shops?id=in.(${ids.join(',')})&select=id,name`, {
      headers: { apikey: process.env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY}` },
    });
    if (r.ok) for (const s of await r.json()) names[s.id] = s.name;
  }
} catch { /* 이름 없이 진행 */ }

const shopLines = topShops.length
  ? topShops.map((s, i) => `${i + 1}. ${names[s.key] || s.key} — ${s.value.toLocaleString()}회`).join('\n')
  : '데이터 없음';
const acqLines = acq.length
  ? acq.map(a => `${a.key} — ${a.value.toLocaleString()}`).join('\n')
  : '데이터 없음';

const embed = {
  title: '📊 GA4 일일 리포트 (샥)',
  color: 0xec4899,
  fields: [
    { name: '어제', value: `활성 ${yUsers.toLocaleString()} · 세션 ${ySessions.toLocaleString()} · 예약클릭 ${yReserve.toLocaleString()}`, inline: false },
    { name: '최근 7일', value: `활성 ${w7Users.toLocaleString()} · 예약클릭 ${w7Reserve.toLocaleString()}`, inline: true },
    { name: '최근 30일', value: `MAU ${m30Users.toLocaleString()} · 예약클릭 ${m30Reserve.toLocaleString()} · 전환율 ${convRate}`, inline: true },
    { name: '인기 샵 Top5 (7일, 상세조회)', value: shopLines, inline: false },
    { name: '유입 경로 Top5 (7일, 세션)', value: acqLines, inline: false },
  ],
  timestamp: new Date().toISOString(),
  footer: { text: 'GA4 Data API' },
};

console.log(`GA4: 어제 활성 ${yUsers} · 30일 MAU ${m30Users} · 예약클릭(30일) ${m30Reserve}`);

if (!WEBHOOK) { console.error('⚠️ DISCORD_WEBHOOK_APP 없음 — 콘솔 출력만'); process.exit(0); }
const res = await fetch(WEBHOOK, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: '샥 GA4', embeds: [embed] }),
});
if (!res.ok) { console.error('❌ 디스코드 전송 실패', res.status, await res.text()); process.exit(1); }
console.log('✅ 디스코드 전송 완료');
