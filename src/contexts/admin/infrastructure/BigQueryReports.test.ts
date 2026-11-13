import { mergeDaily, syncGaReports, bigQueryEventSummary } from './BigQueryReports';
import { Pool } from 'pg';

describe('GA4 report archive', () => {
  it('replaces corrected recent days without doubling historical counts', () => {
    const row = (date: string, count: number) => ({ date, event: 'reserve_click', count, users: 1 });
    const previous = [row('2026-11-01', 10), row('2026-11-10', 5), row('2026-11-11', 4)];
    expect(mergeDaily(previous, [row('2026-11-10', 7)], '2026-11-10'))
      .toEqual([row('2026-11-01', 10), row('2026-11-10', 7)]);
  });
  it('does not launch duplicate work when another server holds the advisory lock', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [{ locked: false }] }), release: jest.fn() };
    await syncGaReports({ connect: async () => db } as unknown as Pool);
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.release).toHaveBeenCalled();
  });
  it('skips recently imported reports and releases the database lock', async () => {
    const db = { query: jest.fn().mockResolvedValueOnce({ rows: [{ locked: true }] })
      .mockResolvedValueOnce({}).mockResolvedValueOnce({ rows: [{ rows: [], synced_at: new Date() }] })
      .mockResolvedValueOnce({}), release: jest.fn() };
    await syncGaReports({ connect: async () => db } as unknown as Pool);
    expect(db.query).toHaveBeenLastCalledWith('SELECT pg_advisory_unlock(544178953)');
    expect(db.release).toHaveBeenCalled();
  });
  it('rejects unexpected query ranges before accessing Google', async () => {
    await expect(bigQueryEventSummary(-1)).rejects.toThrow('Invalid report range');
  });
});
