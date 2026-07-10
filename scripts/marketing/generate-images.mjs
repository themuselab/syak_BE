#!/usr/bin/env node
/**
 * 인스타 피드용 이미지 생성 → Supabase Storage 업로드 → 오늘 스냅샷의 data.images 갱신.
 *
 *   node scripts/marketing/generate-images.mjs [장수(기본 5)]
 *
 * ℹ️ 평소엔 관리자 → 마케팅 → "이미지 생성" 버튼을 쓰면 된다. 이 스크립트는 CLI 대안.
 *    프롬프트는 image-recipes.json 하나로 관리한다.
 *
 * 필요 env
 *   SUPABASE_URL, SUPABASE_SECRET_KEY
 *   NVIDIA_API_KEY (또는 NVIDIA_API_KEY_FLUX)
 *
 * 프롬프트 원칙 (검증됨 — .claude/skills/marketing-report/image_prompt_guide.md)
 *  - 톤: 뮤트 웜톤 + 얕은 심도 + 필름 질감. ⚠️ high-key / bright airy 금지(하얗고 납작해짐)
 *  - 모델: 손·인물이 들어가면 반드시 flux.1-dev(steps 40~45). klein(4steps)은 손이 깨진다
 *  - 손: 손 해부 키워드 + 시드를 바꿔 여러 장 뽑아 고르는 게 전제 (AI 손은 확률 게임)
 *  - 콘텐츠 필터 회피: 나이 숫자 / beach·bikini·selfie 금지
 *  - 텍스트는 발행 시 수동으로 얹으므로 생성물엔 텍스트 없음
 */

import { readFileSync } from 'node:fs';

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SECRET_KEY;
const NV_KEY = process.env.NVIDIA_API_KEY_FLUX || process.env.NVIDIA_API_KEY;
const BUCKET = 'marketing-images';

if (!SB_URL || !SB_KEY || !NV_KEY) {
  console.error('❌ SUPABASE_URL / SUPABASE_SECRET_KEY / NVIDIA_API_KEY 필요');
  process.exit(1);
}

const COUNT = Math.min(Math.max(parseInt(process.argv[2] ?? '5', 10) || 5, 1), 10);

/** 프롬프트 단일 소스 — 관리자 "이미지 생성" 버튼(MarketingImageService.ts)과 공유한다. */
const { model: MODEL, steps: STEPS, tone: TONE, hand: HAND, recipes } =
  JSON.parse(readFileSync(new URL('./image-recipes.json', import.meta.url), 'utf8'));

const RECIPES = recipes.map(r => ({ caption: r.caption, prompt: `${r.scene}, ${HAND}, ${TONE}` }));

const todayKst = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

const sbHeaders = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };

/** NVIDIA로 이미지 1장 생성 → Buffer */
async function generate({ prompt }, seed) {
  const res = await fetch(`https://ai.api.nvidia.com/v1/genai/${MODEL}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${NV_KEY}`, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, steps: STEPS, seed }),
  });
  if (!res.ok) throw new Error(`NVIDIA HTTP ${res.status}`);
  const json = await res.json();
  const art = json?.artifacts?.[0];
  if (!art?.base64) throw new Error(`생성 실패 (${art?.finishReason ?? 'empty'})`);
  return Buffer.from(art.base64, 'base64');
}

/** Storage 업로드 → 공개 URL */
async function upload(path, buf) {
  const res = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: { ...sbHeaders, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
    body: buf,
  });
  if (!res.ok) throw new Error(`업로드 실패 HTTP ${res.status}: ${await res.text()}`);
  return `${SB_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

// ── 실행 ────────────────────────────────────────────────────────
const date = todayKst();

// 갤러리는 누적이므로 기존 이미지 뒤에 이어 붙인다 (파일명 번호도 이어서)
const cur = await fetch(`${SB_URL}/rest/v1/marketing_snapshots?snapshot_date=eq.${date}&select=data`, { headers: sbHeaders })
  .then(r => r.json());
const prevData = cur?.[0]?.data ?? {};
const prevImages = Array.isArray(prevData.images) ? prevData.images : [];
const maxN = prevImages.reduce((m, im) => Math.max(m, parseInt(im.id.slice(11), 10) || 0), 0);

const fresh = [];
for (let i = 0; i < COUNT; i++) {
  const recipe = RECIPES[i % RECIPES.length];
  const seed = 1000 + i;
  const n = maxN + i + 1;
  try {
    process.stderr.write(`  [${i + 1}/${COUNT}] ${recipe.caption} … `);
    const buf = await generate(recipe, seed);
    const url = await upload(`${date}/${n}.jpg`, buf);
    fresh.push({ id: `${date}-${n}`, url, caption: recipe.caption, date });
    console.error(`OK (${Math.round(buf.length / 1024)}KB)`);
  } catch (e) {
    console.error(`실패: ${e.message}`);
  }
}

if (!fresh.length) { console.error('❌ 생성된 이미지가 없습니다'); process.exit(1); }

const images = [...prevImages, ...fresh];
const data = { ...prevData, images };

const res = await fetch(`${SB_URL}/rest/v1/marketing_snapshots?on_conflict=snapshot_date`, {
  method: 'POST',
  headers: { ...sbHeaders, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
  body: JSON.stringify({ snapshot_date: date, data, updated_at: new Date().toISOString() }),
});
if (!res.ok) { console.error('❌ 스냅샷 갱신 실패:', await res.text()); process.exit(1); }

console.log(`✅ ${fresh.length}장 추가 (총 ${images.length}장) · snapshot_date=${date}`);
fresh.forEach(im => console.log(`   ${im.caption} → ${im.url}`));
