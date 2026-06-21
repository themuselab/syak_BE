import Redis from 'ioredis';
import { ICacheService } from './ICacheService';
import { logger } from '../logger';

export class RedisCacheService implements ICacheService {
  private readonly client: Redis;

  constructor(url: string) {
    this.client = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      lazyConnect: true,
    });

    this.client.on('error', (err) => {
      // 연결 에러는 경고만 — 캐시 미스로 처리되어 DB로 fallback
      logger.warn({ err }, 'Redis error (cache miss fallback)');
    });
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.client.get(key);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch {
      // 캐시 쓰기 실패는 무시 — 다음 요청이 DB에서 다시 채움
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch {
      // ignore
    }
  }

  async quit(): Promise<void> {
    await this.client.quit();
  }
}
