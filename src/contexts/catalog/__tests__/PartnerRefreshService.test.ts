import { PartnerRefreshService } from '../infrastructure/PartnerRefreshService';
import { Pool } from 'pg';

describe('Partner refresh snapshot safety', () => {
  const now = () => new Date().toISOString();
  function setup(detail: unknown = {}, member = true) {
    const query = jest.fn(async (sql: string, _params?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount?: number }> => {
      if (sql.startsWith('SELECT detail')) return { rows: member ? [{ detail }] : [] };
      if (sql.includes("to_char(date")) return { rows: [{ d: '2026-11-08', t: '10:00' }] };
      return { rows: [], rowCount: 1 };
    });
    const release = jest.fn();
    const pool = { connect: jest.fn().mockResolvedValue({ query, release }), query: jest.fn() };
    const cache = { get: jest.fn(), set: jest.fn(), del: jest.fn(), delPrefix: jest.fn() };
    return { svc: new PartnerRefreshService(pool as unknown as Pool, cache), query, release, cache, pool };
  }
  test('removed partner cannot be updated or re-enabled', async () => {
    const { svc, query } = setup({}, false);
    expect(await svc.apply('1', 'events', now(), { event_desc: null })).toEqual({ applied: false, newSlots: [] });
    expect(query.mock.calls.some(([sql]) => sql.startsWith('UPDATE') || sql.startsWith('DELETE'))).toBe(false);
  });
  test('older source snapshot cannot overwrite newer data', async () => {
    const { svc } = setup({ _partnerRefresh: { events: now() } });
    expect((await svc.apply('1', 'events', new Date(Date.now() - 1000).toISOString(), { event_desc: null })).applied).toBe(false);
  });
  test('verified empty slots remove scraper window, preserve owner slots and invalidate cache', async () => {
    const { svc, query, cache, release } = setup();
    await svc.apply('1', 'slots', now(), { startDate: '2026-11-08', endDate: '2026-11-10', slots: [], summary: [] });
    const deletion = query.mock.calls.find(([sql]) => sql.startsWith('DELETE'))!;
    expect(deletion[0]).toContain("source='scraper'");
    expect(query.mock.calls.some(([sql]) => sql === 'COMMIT')).toBe(true);
    expect(cache.delPrefix).toHaveBeenCalledWith('slots:');
    expect(release).toHaveBeenCalled();
  });
  test('out-of-window payload rolls back before deleting existing data', async () => {
    const { svc, query, cache } = setup();
    await expect(svc.apply('1', 'slots', now(), { startDate: '2026-11-08', endDate: '2026-11-10', slots: [{ date: '2026-11-12', startTime: '10:00' }], summary: [] })).rejects.toThrow();
    expect(query.mock.calls.some(([sql]) => sql.startsWith('DELETE'))).toBe(false);
    expect(query.mock.calls.some(([sql]) => sql === 'ROLLBACK')).toBe(true);
    expect(cache.del).not.toHaveBeenCalled();
  });
  test('unchanged slot rows are retained instead of being deleted and inserted on every poll', async () => {
    const { svc, query } = setup();
    const result = await svc.apply('1', 'slots', now(), { startDate: '2026-11-08', endDate: '2026-11-10', slots: [{ date: '2026-11-08', startTime: '10:00' }], summary: [] });
    expect(query.mock.calls.some(([sql]) => sql.startsWith('INSERT INTO slots'))).toBe(false);
    const deletion = query.mock.calls.find(([sql]) => sql.startsWith('DELETE'))!;
    expect(deletion[0]).toContain('NOT EXISTS');
    expect(JSON.parse(deletion[1]![3] as string)).toEqual([{ date: '2026-11-08', startTime: '10:00' }]);
    expect(result.newSlots).toEqual([]);
  });
  test('detail replaces bounded arrays and keeps photo sections omitted after a failed fetch', async () => {
    const { svc, query } = setup({ images: { gallery: ['old'], review: ['review'] }, _partnerRefresh: { slots: 'previous' } });
    await svc.apply('1', 'details', now(), { detail: { reviews: [], images: { gallery: Array.from({ length: 40 }, (_, i) => `new-${i}`) } } });
    const update = query.mock.calls.find(([sql]) => sql.includes("detail=COALESCE"))!;
    const patch = JSON.parse(update[1]![1] as string);
    expect(patch.images.gallery).toHaveLength(12);
    expect(patch.images.gallery).not.toContain('old');
    expect(patch.images.review).toEqual(['review']);
    expect(patch.reviews).toEqual([]);
    expect(patch._partnerRefresh.slots).toBe('previous');
  });
  test('database failure rolls back and never invalidates cache as a successful refresh', async () => {
    const { svc, query, cache, release } = setup();
    query.mockImplementation(async (sql: string) => {
      if (sql.startsWith('SELECT detail')) return { rows: [{ detail: {} }], rowCount: 1 };
      if (sql.startsWith('UPDATE')) throw new Error('write failed');
      return { rows: [], rowCount: 0 };
    });
    await expect(svc.apply('1', 'events', now(), { event_desc: null })).rejects.toThrow('write failed');
    expect(query.mock.calls.some(([sql]) => sql === 'ROLLBACK')).toBe(true);
    expect(cache.del).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalled();
  });
});
