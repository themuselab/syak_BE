#!/usr/bin/env node
/**
 * 마케팅 성과 일일 스냅샷 — GitHub Actions에서 매일 자동 실행.
 *
 *   수집(인스타/쓰레드/메타광고) → Gemini 조언 → Supabase upsert
 *
 * Claude/MCP 없이 도는 순수 Node 스크립트다. (수동 스킬 호출 불필요)
 *
 * 필요 env
 *   SUPABASE_URL, SUPABASE_SECRET_KEY        (필수)
 *   IG_ACCESS_TOKEN                          (인스타. 최초 1회. 이후 Supabase에 자동 보관·갱신)
 *   META_ADS_ACCESS_TOKEN, META_AD_ACCOUNT_ID (선택 — 광고)
 *   THREADS_ACCESS_TOKEN, THREADS_USER_ID     (선택 — 쓰레드)
 *   GEMINI_API_KEY, GEMINI_MODEL              (선택 — AI 조언)
 *   GRAPH_VERSION (기본 v21.0)
 *
 * 토큰 자가치유: 인스타 토큰은 60일 만료. 만료 10일 이내면 자동 갱신 후
 * Supabase `marketing_tokens` 에 다시 저장한다. → 워크플로가 60일 내 한 번만 돌면 영구 유지.
 */

const V   = process.env.GRAPH_VERSION || 'v21.0';
const FB  = `https://graph.facebook.com/${V}`;
const IGH = `https://graph.instagram.com/${V}`;
const TH  = 'https://graph.threads.net/v1.0';

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SECRET_KEY;
const GEMINI_KEY   = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

if (!SB_URL || !SB_KEY) {
  console.error('❌ SUPABASE_URL / SUPABASE_SECRET_KEY 필요');
  process.exit(1);
}

// ── 포맷 헬퍼 (contract는 표시용 문자열) ─────────────────────────
const kompact = n => {
  n = Number(n) || 0;
  if (Math.abs(n) >= 1000) return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + 'K';
  return String(n);
};
const pct = (n, d = 2) => (Number(n) || 0).toFixed(d) + '%';
const money = (n, cur = 'KRW') => {
  const v = Number(n) || 0;
  if (cur === 'KRW') return '₩' + Math.round(v).toLocaleString('ko-KR');
  const sym = { USD: '$', EUR: '€', JPY: '¥' }[cur] || (cur + ' ');
  return sym + v.toFixed(2);
};
const warn = (label, e) => console.error(`  [skip] ${label}: ${e.message}`);

/** 최근 30일 unix 타임 윈도우.
 *  ⚠️ since/until 없이 부르면 Meta API가 "하루치"만 반환한다 (총합처럼 보여 오해 유발). */
const WINDOW_DAYS = 30;
const nowSec   = () => Math.floor(Date.now() / 1000);
const sinceSec = () => nowSec() - WINDOW_DAYS * 86400;

async function getJSON(url) {
  const res = await fetch(url);
  const json = await res.json();
  if (json.error) throw new Error(`${json.error.code ?? ''}: ${json.error.message}`);
  return json;
}

// ── Supabase: 토큰 보관/조회 ────────────────────────────────────
const sbHeaders = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
};

async function loadToken(key) {
  const res = await fetch(`${SB_URL}/rest/v1/marketing_tokens?key=eq.${key}&select=token,expires_at`, { headers: sbHeaders });
  if (!res.ok) return null;
  const rows = await res.json();
  return rows?.[0] ?? null;
}

async function saveToken(key, token, expiresAt) {
  const res = await fetch(`${SB_URL}/rest/v1/marketing_tokens?on_conflict=key`, {
    method: 'POST',
    headers: { ...sbHeaders, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ key, token, expires_at: expiresAt, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) console.error(`  [warn] 토큰 저장 실패(${key}):`, await res.text());
}

/** 인스타 토큰: Supabase 우선 → 만료 10일 이내면 갱신 후 재저장 */
async function resolveInstagramToken() {
  let token = process.env.IG_ACCESS_TOKEN;
  let expiresAt = null;

  const row = await loadToken('instagram').catch(() => null);
  if (row?.token) { token = row.token; expiresAt = row.expires_at; }
  if (!token) return null;

  const daysLeft = expiresAt ? (new Date(expiresAt) - Date.now()) / 86400000 : -1;
  if (daysLeft > 10) {
    console.error(`  [ig] 토큰 유효 (약 ${Math.round(daysLeft)}일 남음)`);
    return token;
  }

  // 갱신 (시크릿 불필요)
  try {
    const r = await getJSON(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${token}`);
    const newExp = new Date(Date.now() + r.expires_in * 1000).toISOString();
    await saveToken('instagram', r.access_token, newExp);
    console.error(`  [ig] 토큰 갱신됨 → ${newExp.slice(0, 10)} 까지`);
    return r.access_token;
  } catch (e) {
    console.error('  [ig] 토큰 갱신 실패, 기존 토큰으로 진행:', e.message);
    return token;
  }
}

// ── 수집: 인스타그램 ────────────────────────────────────────────
async function fetchInstagram(token) {
  if (!token) { warn('instagram', new Error('토큰 없음')); return undefined; }
  const totals = [], topPosts = [];
  try {
    const win = `&since=${sinceSec()}&until=${nowSec()}`;
    const prof = await getJSON(`${IGH}/me?fields=followers_count,media_count&access_token=${token}`);
    // 30일 중복제거 도달 / 조회 — since·until + metric_type=total_value 필수
    const reachRes = await getJSON(`${IGH}/me/insights?metric=reach&period=day&metric_type=total_value${win}&access_token=${token}`);
    const reach = reachRes.data?.[0]?.total_value?.value ?? 0;
    const viewsRes = await getJSON(`${IGH}/me/insights?metric=views&period=day&metric_type=total_value${win}&access_token=${token}`);
    const views = viewsRes.data?.[0]?.total_value?.value ?? 0;

    totals.push({ label: '도달',   value: kompact(reach) });
    totals.push({ label: '조회',   value: kompact(views) });
    totals.push({ label: '팔로워', value: kompact(prof.followers_count) });
    totals.push({ label: '게시물', value: kompact(prof.media_count) });
  } catch (e) { warn('instagram totals', e); }

  try {
    const media = await getJSON(`${IGH}/me/media?fields=caption,permalink,timestamp,like_count,comments_count,insights.metric(saved,reach)&limit=25&access_token=${token}`);
    const rows = (media.data ?? []).map(m => {
      const pick = n => m.insights?.data?.find(d => d.name === n || d.metric === n)?.values?.[0]?.value ?? 0;
      return {
        caption: (m.caption || '(캡션 없음)').split('\n')[0].slice(0, 24),
        url: m.permalink ?? null,
        saved: pick('saved'), reach: pick('reach'), likes: m.like_count ?? 0,
      };
    }).sort((a, b) => b.saved - a.saved).slice(0, 3);
    for (const r of rows) topPosts.push({ caption: r.caption, url: r.url, metric: `저장 ${r.saved}`, sub: `도달 ${kompact(r.reach)} · 좋아요 ${kompact(r.likes)}` });
  } catch (e) { warn('instagram media', e); }

  if (!totals.length && !topPosts.length) return undefined;
  return { totals, topPosts };
}

/** 쓰레드 토큰: 인스타와 동일하게 Supabase 보관 → 만료 10일 이내면 th_refresh_token 갱신 */
async function resolveThreadsToken() {
  let token = process.env.THREADS_ACCESS_TOKEN;
  let expiresAt = null;

  const row = await loadToken('threads').catch(() => null);
  if (row?.token) { token = row.token; expiresAt = row.expires_at; }
  if (!token) return null;

  const daysLeft = expiresAt ? (new Date(expiresAt) - Date.now()) / 86400000 : -1;
  if (daysLeft > 10) {
    console.error(`  [threads] 토큰 유효 (약 ${Math.round(daysLeft)}일 남음)`);
    return token;
  }
  try {
    const r = await getJSON(`${TH.replace('/v1.0', '')}/refresh_access_token?grant_type=th_refresh_token&access_token=${token}`);
    const newExp = new Date(Date.now() + r.expires_in * 1000).toISOString();
    await saveToken('threads', r.access_token, newExp);
    console.error(`  [threads] 토큰 갱신됨 → ${newExp.slice(0, 10)} 까지`);
    return r.access_token;
  } catch (e) {
    console.error('  [threads] 토큰 갱신 실패, 기존 토큰으로 진행:', e.message);
    return token;
  }
}

// ── 수집: 쓰레드 ────────────────────────────────────────────────
async function fetchThreads(token) {
  const id = process.env.THREADS_USER_ID;
  if (!token || !id) { warn('threads', new Error('THREADS_ACCESS_TOKEN/THREADS_USER_ID 없음(선택)')); return undefined; }
  const totals = [], topPosts = [];
  try {
    // 30일 윈도우 필수. views는 일별 values[] 합, 나머지는 total_value.
    const win = `&since=${sinceSec()}&until=${nowSec()}`;
    const ins = await getJSON(`${TH}/${id}/threads_insights?metric=views,likes,replies,reposts,quotes${win}&access_token=${token}`);
    const node = m => ins.data?.find(x => x.name === m);
    const sumDaily = m => (node(m)?.values ?? []).reduce((s, v) => s + (v.value || 0), 0);
    const totalVal = m => node(m)?.total_value?.value ?? 0;

    totals.push({ label: '조회',     value: kompact(sumDaily('views') || totalVal('views')) });
    totals.push({ label: '좋아요',   value: kompact(totalVal('likes')) });
    totals.push({ label: '댓글',     value: kompact(totalVal('replies')) });
    totals.push({ label: '리포스트', value: kompact(totalVal('reposts')) });
  } catch (e) { warn('threads insights', e); }

  try {
    const posts = await getJSON(`${TH}/${id}/threads?fields=text,permalink,timestamp&limit=15&access_token=${token}`);
    const enriched = [];
    for (const p of (posts.data ?? []).slice(0, 10)) {
      try {
        const pi = await getJSON(`${TH}/${p.id}/insights?metric=views,likes,reposts,replies&access_token=${token}`);
        const g = m => {
          const d = pi.data?.find(x => x.name === m);
          return d?.values?.[0]?.value ?? d?.total_value?.value ?? 0;
        };
        enriched.push({
          caption: (p.text || '(내용 없음)').split('\n')[0].slice(0, 24),
          url: p.permalink ?? null,
          views: g('views'), likes: g('likes'), replies: g('replies'), reposts: g('reposts'),
        });
      } catch { /* per-post 실패 무시 */ }
    }
    // 리포스트는 대부분 0이라 정렬 기준으로 부적합 → 조회수 기준
    for (const r of enriched.sort((a, b) => b.views - a.views).slice(0, 3))
      topPosts.push({ caption: r.caption, url: r.url, metric: `조회 ${kompact(r.views)}`, sub: `좋아요 ${kompact(r.likes)} · 댓글 ${kompact(r.replies)}` });
  } catch (e) { warn('threads posts', e); }

  if (!totals.length && !topPosts.length) return undefined;
  return { totals, topPosts };
}

// ── 수집: 메타 광고 ─────────────────────────────────────────────
async function fetchAds() {
  const token = process.env.META_ADS_ACCESS_TOKEN;
  const ad = process.env.META_AD_ACCOUNT_ID;
  if (!token || !ad) { warn('ads', new Error('META_ADS_ACCESS_TOKEN/META_AD_ACCOUNT_ID 없음(선택)')); return undefined; }
  try {
    let cur = 'KRW';
    try { cur = (await getJSON(`${FB}/act_${ad}?fields=currency&access_token=${token}`)).currency || 'KRW'; } catch { /* 기본값 */ }

    const r = await getJSON(`${FB}/act_${ad}/insights?fields=spend,ctr,cpc,impressions,clicks,actions,purchase_roas&date_preset=yesterday&access_token=${token}`);
    const row = r.data?.[0];
    if (!row) { warn('ads', new Error('어제 집행 데이터 없음')); return undefined; }

    const conv = row.actions?.find(a => /purchase|offsite_conversion|lead/.test(a.action_type))?.value;
    const roas = row.purchase_roas?.[0]?.value;

    const cards = [
      { label: '광고 지출', value: money(row.spend, cur) },
      { label: 'CTR', value: pct(row.ctr) },
      { label: 'CPC', value: money(row.cpc, cur) },
    ];
    if (conv || roas) cards.push({ label: '전환 · ROAS', value: `${conv ?? 0}${roas ? ` · ${Number(roas).toFixed(1)}x` : ''}` });
    else cards.push({ label: '클릭', value: kompact(row.clicks) });
    return cards;
  } catch (e) { warn('ads', e); return undefined; }
}

// ── Gemini AI 조언 ──────────────────────────────────────────────
/**
 * 형식 고정: (1) 무엇이 조회/반응이 좋았는지 근거를 숫자로 제시
 *            (2) 그래서 어떤 방향의 후속작을 추천
 * 2줄로 받아 aiAdvice / aiFollowUp 에 나눠 담는다.
 */
async function geminiAdvice(platformName, data) {
  if (!GEMINI_KEY || !data) return;
  const summary = [
    `플랫폼: ${platformName}`,
    `총합: ${(data.totals ?? []).map(t => `${t.label} ${t.value}`).join(', ')}`,
    `상위 게시물: ${(data.topPosts ?? []).map(p => `"${p.caption}" (${p.metric}, ${p.sub ?? ''})`).join(' / ')}`,
  ].join('\n');

  const prompt =
    '너는 뷰티샵 SNS 마케팅 분석가다. 아래 성과 데이터를 보고 정확히 2줄로만 답하라. 군더더기·머리말 금지.\n' +
    '1줄: 어떤 콘텐츠가 조회수/반응이 좋았는지 구체적 수치를 근거로 한 문장.\n' +
    '2줄: 그 근거를 바탕으로 어떤 방향의 후속 콘텐츠를 만들지 추천하는 한 문장.\n\n' +
    summary;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) throw new Error('빈 응답');
    const lines = text.split('\n').map(s => s.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean);
    data.aiAdvice   = lines[0] ?? text;
    data.aiFollowUp = lines[1] ?? lines[0] ?? text;
  } catch (e) {
    console.error(`  [warn] Gemini(${platformName}) 실패:`, e.message);
  }
}

// ── Supabase upsert ────────────────────────────────────────────
/**
 * `data` JSONB는 통째로 치환되므로, 이 스크립트가 만들지 않는 키(`images` 등)는
 * 기존 행에서 읽어와 보존한다. (안 그러면 generate-images.mjs 가 올린 시안 갤러리가
 * 매일 아침 워크플로 실행 때 지워진다)
 */
async function upsertSnapshot(snapshotDate, data) {
  const prev = await fetch(
    `${SB_URL}/rest/v1/marketing_snapshots?snapshot_date=eq.${snapshotDate}&select=data`,
    { headers: sbHeaders },
  ).then(r => (r.ok ? r.json() : [])).catch(() => []);

  const keep = {};
  const images = prev?.[0]?.data?.images;
  if (Array.isArray(images) && images.length) keep.images = images;

  const res = await fetch(`${SB_URL}/rest/v1/marketing_snapshots?on_conflict=snapshot_date`, {
    method: 'POST',
    headers: { ...sbHeaders, Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({ snapshot_date: snapshotDate, data: { ...keep, ...data }, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`upsert 실패 HTTP ${res.status}: ${await res.text()}`);
}

// ── 실행 ────────────────────────────────────────────────────────
const [igToken, thToken] = await Promise.all([resolveInstagramToken(), resolveThreadsToken()]);
const [instagram, threads, metaAds] = await Promise.all([
  fetchInstagram(igToken),
  fetchThreads(thToken),
  fetchAds(),
]);

await Promise.all([
  geminiAdvice('인스타그램', instagram),
  geminiAdvice('쓰레드', threads),
]);

const payload = {};
if (metaAds)   payload.metaAds   = metaAds;
if (instagram) payload.instagram = instagram;
if (threads)   payload.threads   = threads;

if (!Object.keys(payload).length) {
  console.error('❌ 수집된 데이터가 없습니다. 토큰/권한을 확인하세요.');
  process.exit(1);
}

// KST 기준 오늘 날짜
const snapshotDate = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
await upsertSnapshot(snapshotDate, payload);

console.log(`✅ 저장 완료 · snapshot_date=${snapshotDate}`);
console.log(`   수집: ${Object.keys(payload).join(', ')}`);
