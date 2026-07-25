import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * 관리자 페이지에서 쓰레드에 직접 답글/글을 올린다.
 * 토큰은 EC2 env가 아니라 Supabase marketing_tokens(key='threads')에 자가치유 저장돼
 * 있으므로 거기서 읽는다(없으면 env fallback).
 *
 * 발행은 2단계: (1) 컨테이너 생성 → creation_id (2) threads_publish 로 발행.
 */

const TH = 'https://graph.threads.net/v1.0';

/** 설정 누락(토큰 없음)은 서버 장애가 아니라 503 + 원인 메시지로 구분 */
export class ThreadsConfigError extends Error {}

async function getToken(sb: SupabaseClient): Promise<string> {
  try {
    const { data } = await sb.from('marketing_tokens').select('token').eq('key', 'threads').limit(1);
    const t = (data as { token?: string }[] | null)?.[0]?.token;
    if (t) return t;
  } catch { /* fallback으로 */ }
  const env = process.env.THREADS_ACCESS_TOKEN;
  if (env) return env;
  throw new ThreadsConfigError('쓰레드 토큰이 없습니다 (marketing_tokens 또는 THREADS_ACCESS_TOKEN 확인)');
}

async function thPost(path: string, params: Record<string, string>): Promise<{ id: string }> {
  const body = new URLSearchParams(params);
  const res = await fetch(`${TH}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = await res.json() as { id?: string; error?: { message?: string } };
  if (!res.ok || !json.id) throw new Error(json.error?.message || `HTTP ${res.status}`);
  return { id: json.id };
}

async function permalinkOf(id: string, token: string): Promise<string | null> {
  try {
    const res = await fetch(`${TH}/${id}?fields=permalink&access_token=${token}`);
    const json = await res.json() as { permalink?: string };
    return json.permalink ?? null;
  } catch { return null; }
}

/** 컨테이너 생성 → 발행. 텍스트는 보통 바로 발행되지만 'not ready'면 잠깐 후 1회 재시도. */
async function createAndPublish(token: string, params: Record<string, string>): Promise<{ id: string; permalink: string | null }> {
  const container = await thPost('me/threads', { media_type: 'TEXT', ...params, access_token: token });

  let published: { id: string } | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      published = await thPost('me/threads_publish', { creation_id: container.id, access_token: token });
      break;
    } catch (e) {
      if (attempt === 0 && /not ready|processing|media/i.test((e as Error).message)) {
        await new Promise(r => setTimeout(r, 2500));
        continue;
      }
      throw e;
    }
  }
  if (!published) throw new Error('발행 실패');
  return { id: published.id, permalink: await permalinkOf(published.id, token) };
}

/** 특정 댓글/글에 답글 달기 */
export async function replyToThread(sb: SupabaseClient, replyToId: string, text: string) {
  const token = await getToken(sb);
  return createAndPublish(token, { text, reply_to_id: replyToId });
}

/** 새 쓰레드 글 발행 */
export async function publishThread(sb: SupabaseClient, text: string) {
  const token = await getToken(sb);
  return createAndPublish(token, { text });
}

async function callGemini(prompt: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new ThreadsConfigError('GEMINI_API_KEY 가 서버에 설정되지 않았습니다');
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) },
  );
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
  const json = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error('Gemini 빈 응답');
  return text;
}

/**
 * 주제(topic)로 새 쓰레드 글 초안을 추천한다.
 * 우리가 그동안 쓴 글들의 말투·구조·길이를 학습해(스타일 샘플) 그 목소리로 쓴다.
 */
export async function generateThreadsDraft(sb: SupabaseClient, topic: string): Promise<{ draft: string; usedSamples: number }> {
  const token = await getToken(sb);
  // 우리 최근 글 본문 = 스타일 샘플
  let samples: string[] = [];
  try {
    const res = await fetch(`${TH}/me/threads?fields=text&limit=15&access_token=${token}`);
    const json = await res.json() as { data?: { text?: string }[] };
    samples = (json.data ?? []).map(p => (p.text ?? '').trim()).filter(t => t.length > 10).slice(0, 10);
  } catch { /* 샘플 없이도 진행 */ }

  const styleBlock = samples.length
    ? '아래는 우리가 그동안 실제로 쓴 쓰레드 글이다. 이 말투·문장 길이·줄바꿈·이모지 습관·글 구조를 그대로 따라 하라:\n' +
      samples.map((s, i) => `[예시 ${i + 1}]\n${s}`).join('\n\n') + '\n\n'
    : '';

  const prompt =
    '너는 뷰티샵 "뮤즈랩"의 SNS 담당자다. 아래 주제로 쓰레드에 올릴 새 글 초안을 써라.\n' +
    styleBlock +
    '위 예시와 똑같은 말투·톤으로, 주어진 주제의 글을 자연스럽게 완성하라. 머리말·따옴표·설명 없이 글 본문만 출력. 500자 이내.\n\n' +
    `주제: ${topic}`;

  const draft = await callGemini(prompt);
  return { draft: draft.slice(0, 500), usedSamples: samples.length };
}
