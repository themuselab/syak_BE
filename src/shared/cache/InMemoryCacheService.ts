import { ICacheService } from './ICacheService';

/**
 * 프로세스 내 TTL + LRU 캐시.
 *
 * 운영에 Redis(REDIS_URL)가 없을 때의 fallback. 예전엔 NullCacheService(no-op)라
 * 소비자 카탈로그 캐시가 전부 무력화돼 매 요청이 Supabase로 직행했다.
 * 단일 인스턴스 기준으로 동작하며(다중 인스턴스면 인스턴스별 캐시), 서버 재시작 시 소멸.
 *
 * - TTL: set(key, value, ttlSeconds) 만료 시 자동 미스
 * - LRU: maxEntries 초과 시 가장 오래 접근 안 한 항목부터 제거 (메모리 상한)
 */
export class InMemoryCacheService implements ICacheService {
  private store = new Map<string, { value: unknown; expiresAt: number }>();

  constructor(private readonly maxEntries = 1000) {}

  async get<T>(key: string): Promise<T | null> {
    const hit = this.store.get(key);
    if (!hit) return null;
    if (Date.now() > hit.expiresAt) {
      this.store.delete(key);
      return null;
    }
    // LRU: 최근 접근으로 갱신 (Map은 삽입 순서를 유지하므로 지웠다 다시 넣음)
    this.store.delete(key);
    this.store.set(key, hit);
    return hit.value as T;
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (this.store.has(key)) this.store.delete(key);
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    // 상한 초과 시 가장 오래된(Map 앞쪽) 항목부터 제거
    while (this.store.size > this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest === undefined) break;
      this.store.delete(oldest);
    }
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }
}
