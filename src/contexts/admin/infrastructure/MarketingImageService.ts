import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Pool } from 'pg';
import { s3PutJpeg } from './S3Service';

/**
 * 인스타 발행용 시안 이미지 생성 (NVIDIA FLUX → S3, 스냅샷은 RDS).
 *
 * 관리자 "이미지 생성" 버튼과 CLI가 같은 레시피 JSON을 읽으므로 프롬프트가 갈라지지 않는다.
 */

export const MARKETING_BUCKET = 'marketing-images'; // (레거시 참조 호환)

export interface MarketingImage {
  id: string;
  url: string;
  caption?: string;
  date?: string;
}

interface Recipes {
  model: string;
  steps: number;
  tone: string;
  hand: string;
  recipes: { caption: string; scene: string }[];
}

/** 설정 누락(키·레시피 파일)은 서버 장애가 아니므로 따로 구분해 503으로 응답한다. */
export class ImageGenConfigError extends Error {}

let cached: Recipes | null = null;
function loadRecipes(): Recipes {
  if (!cached) {
    const p = resolve(process.cwd(), 'scripts/marketing/image-recipes.json');
    try {
      cached = JSON.parse(readFileSync(p, 'utf8')) as Recipes;
    } catch {
      throw new ImageGenConfigError(`이미지 레시피 파일을 찾을 수 없습니다 (${p}). Dockerfile의 COPY 확인 필요`);
    }
  }
  return cached;
}

/** NVIDIA로 1장 생성 → JPEG Buffer */
async function generateOne(prompt: string, model: string, steps: number, seed: number): Promise<Buffer> {
  const key = process.env.NVIDIA_API_KEY_FLUX || process.env.NVIDIA_API_KEY;
  if (!key) throw new ImageGenConfigError('NVIDIA_API_KEY 가 서버에 설정되지 않았습니다');

  const res = await fetch(`https://ai.api.nvidia.com/v1/genai/${model}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, steps, seed }),
  });
  if (!res.ok) throw new Error(`NVIDIA HTTP ${res.status}`);

  const json = await res.json() as { artifacts?: { base64?: string; finishReason?: string }[] };
  const art = json.artifacts?.[0];
  // 안전필터에 걸리면 finishReason=CONTENT_FILTERED + 빈 base64 로 돌아온다
  if (!art?.base64) throw new Error(`생성 실패 (${art?.finishReason ?? 'empty'})`);
  return Buffer.from(art.base64, 'base64');
}

/** KST 기준 오늘 (YYYY-MM-DD) */
const todayKst = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

/**
 * count 장을 병렬 생성 → Storage 업로드 → 오늘 스냅샷 data.images 에 **append**.
 * 일부가 실패해도 성공분만 저장하고, 실패 건수를 함께 반환한다.
 */
export async function generateMarketingImages(
  rds: Pool,
  count: number,
): Promise<{ images: MarketingImage[]; added: number; failed: number; date: string }> {
  if (!process.env.NVIDIA_API_KEY_FLUX && !process.env.NVIDIA_API_KEY) {
    throw new ImageGenConfigError('NVIDIA_API_KEY 가 서버에 설정되지 않았습니다');
  }
  const { model, steps, tone, hand, recipes } = loadRecipes();
  const date = todayKst();

  // 기존 이미지 뒤에 이어 붙인다 (갤러리는 계속 누적) — RDS
  const { rows } = await rds.query('SELECT data FROM marketing_snapshots WHERE snapshot_date = $1', [date]);
  const prevData = (rows[0]?.data ?? {}) as Record<string, unknown>;
  const prevImages = (Array.isArray(prevData.images) ? prevData.images : []) as MarketingImage[];

  const maxN = prevImages.reduce((m, im) => Math.max(m, parseInt(im.id.slice(11), 10) || 0), 0);

  const jobs = Array.from({ length: count }, (_, i) => {
    const recipe = recipes[i % recipes.length];
    const n = maxN + i + 1;
    return { recipe, n, seed: Date.now() % 100000 + i };
  });

  const settled = await Promise.allSettled(jobs.map(async ({ recipe, n, seed }) => {
    const buf = await generateOne(`${recipe.scene}, ${hand}, ${tone}`, model, steps, seed);
    const key = `${date}/${n}.jpg`;
    const url = await s3PutJpeg(key, buf); // S3 업로드 → 프록시 URL
    return { id: `${date}-${n}`, url, caption: recipe.caption, date } as MarketingImage;
  }));

  const fresh: MarketingImage[] = [];
  let failed = 0;
  for (const r of settled) {
    if (r.status === 'fulfilled') fresh.push(r.value);
    else { failed++; console.error('[generateMarketingImages]', (r.reason as Error).message); }
  }
  if (!fresh.length) throw new Error('이미지를 한 장도 생성하지 못했습니다');

  const images = [...prevImages, ...fresh];
  await rds.query(
    `INSERT INTO marketing_snapshots (snapshot_date, data, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (snapshot_date) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [date, JSON.stringify({ ...prevData, images })],
  );

  return { images, added: fresh.length, failed, date };
}
