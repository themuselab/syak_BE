import { ICacheService } from './ICacheService';

/** 테스트/Redis 미사용 환경에서 항상 캐시 미스로 동작하는 no-op 구현 */
export class NullCacheService implements ICacheService {
  async get<T>(_key: string): Promise<T | null> { return null; }
  async set(_key: string, _value: unknown, _ttl: number): Promise<void> {}
  async del(_key: string): Promise<void> {}
}
