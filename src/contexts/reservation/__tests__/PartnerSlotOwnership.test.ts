import { Pool } from 'pg';
import { ICacheService } from '../../../shared/cache/ICacheService';
import { ShopSyncService } from '../../catalog/infrastructure/ShopSyncService';
import { PgSlotRepository } from '../infrastructure/PgSlotRepository';

describe('partner slot ownership starts when a shop joins', () => {
  test('nationwide targets, favorite targets and summaries exclude every active partner', async () => {
    const query = jest.fn(async (_sql: string, _args?: unknown[]) => ({ rows: [] }));
    const service = new ShopSyncService({ query } as unknown as Pool);
    await service.getTargets();
    await service.getFavoriteTargets();
    await service.updateSummaries([{ id: 'fresh-partner', slot_summary: [] }]);
    for (const [sql] of query.mock.calls) {
      expect(sql).toContain('is_partner IS NOT TRUE');
      expect(sql).not.toContain('_partnerRefresh');
    }
  });

  test('an old nationwide payload skips a shop which joined before its first partner scan', async () => {
    const query = jest.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [] }));
    const pool = { connect: async () => ({ query, release: jest.fn() }) } as unknown as Pool;
    const repo = new PgSlotRepository(pool, {} as ICacheService);
    const result = await repo.syncScraperWindow('2026-11-28', '2026-11-30', ['fresh-partner'],
      [{ shopId: 'fresh-partner', date: '2026-11-28', startTime: '12:00' }]);
    expect(result).toEqual({ inserted: 0, newSlots: [] });
    expect(query.mock.calls.find(([sql]) => sql.includes('FOR UPDATE'))?.[0]).toContain('is_partner IS NOT TRUE');
    expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO slots'))).toBe(false);
    const cleanup = query.mock.calls.find(([sql]) => sql.includes('date < $1'));
    expect(cleanup?.[0]).toContain('p.is_partner IS TRUE');
  });
});
