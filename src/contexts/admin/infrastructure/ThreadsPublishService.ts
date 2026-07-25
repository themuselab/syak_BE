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
