import { validateExplorerSql, runExplorer } from './QueryExplorer';
import { Pool } from 'pg';

describe('read-only explorer boundary', () => {
  test.each([
    'SELECT id, name FROM shops WHERE is_partner = true LIMIT 100',
    'SELECT gu, count(*) AS total FROM shops GROUP BY gu ORDER BY total DESC LIMIT 100',
    "SELECT shop_id, count(*) FROM favorites GROUP BY shop_id",
    "SELECT name FROM shops WHERE name = 'O''Brien'",
  ])('accepts supported query: %s', sql => expect(validateExplorerSql(sql)).toMatch(/SELECT/i));
  test.each([
    'SELECT event_name FROM analytics_events',
    'DELETE FROM shops', 'SELECT name FROM shops; DROP TABLE shops',
    'SELECT * FROM users', 'SELECT detail FROM shops', 'SELECT * FROM shops',
    'SELECT pg_sleep(20) FROM shops', 'SELECT pg_catalog.pg_read_file(\'/etc/passwd\') FROM shops',
    'SELECT current_setting(\'app.secret\') FROM shops', 'SELECT name FROM private.shops',
    'SELECT name FROM shops FOR UPDATE', 'SELECT name INTO stolen FROM shops',
    'WITH deleted AS (DELETE FROM shops RETURNING name) SELECT name FROM deleted',
    'SELECT name FROM shops UNION SELECT email FROM users',
    'SELECT (SELECT password FROM users) FROM shops',
    'SELECT DISTINCT ON ((SELECT password FROM users)) name FROM shops',
    'SELECT count(*) FROM shops, users', 'SELECT name FROM shops LIMIT 999999',
    'SELECT name FROM shops OFFSET 10000', 'SELECT name::regclass FROM shops',
  ])('rejects unsafe/unsupported SQL: %s', sql => expect(() => validateExplorerSql(sql)).toThrow());
  it('rolls back and releases after timeout', async () => {
    const query = jest.fn().mockResolvedValue({});
    query.mockImplementation(async (sql: string) => { if(sql.startsWith('SELECT')) throw Object.assign(new Error('timeout'), { code: '57014' }); return {}; });
    const release = jest.fn();
    const pool = { connect: async () => ({ query, release }) } as unknown as Pool;
    await expect(runExplorer(pool, 'SELECT name FROM shops')).rejects.toThrow('timeout');
    expect(query).toHaveBeenCalledWith('BEGIN READ ONLY');
    expect(query).toHaveBeenCalledWith('ROLLBACK');
    expect(release).toHaveBeenCalledTimes(1);
  });
});
