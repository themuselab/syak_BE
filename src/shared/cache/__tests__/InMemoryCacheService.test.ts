import { InMemoryCacheService } from '../InMemoryCacheService';

describe('InMemoryCacheService', () => {
  it('set한 값을 get으로 돌려준다', async () => {
    const c = new InMemoryCacheService();
    await c.set('k', { a: 1 }, 60);
    expect(await c.get('k')).toEqual({ a: 1 });
  });

  it('없는 키는 null', async () => {
    const c = new InMemoryCacheService();
    expect(await c.get('none')).toBeNull();
  });

  it('TTL 만료 시 미스', async () => {
    const c = new InMemoryCacheService();
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    await c.set('k', 'v', 1); // 1초
    expect(await c.get('k')).toBe('v');
    now.mockReturnValue(1_000_000 + 1_100); // 1.1초 뒤
    expect(await c.get('k')).toBeNull();
    now.mockRestore();
  });

  it('del로 제거', async () => {
    const c = new InMemoryCacheService();
    await c.set('k', 'v', 60);
    await c.del('k');
    expect(await c.get('k')).toBeNull();
  });

  it('maxEntries 초과 시 가장 오래된 항목부터 제거(LRU)', async () => {
    const c = new InMemoryCacheService(2);
    await c.set('a', 1, 60);
    await c.set('b', 2, 60);
    await c.get('a');              // a를 최근 접근으로 → b가 가장 오래됨
    await c.set('c', 3, 60);       // 상한 초과 → b 제거
    expect(await c.get('a')).toBe(1);
    expect(await c.get('b')).toBeNull();
    expect(await c.get('c')).toBe(3);
  });
});
