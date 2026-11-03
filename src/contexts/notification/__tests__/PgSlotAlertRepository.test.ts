import { Pool } from 'pg';
import { PgSlotAlertRepository } from '../infrastructure/PgSlotAlertRepository';

// 빈자리 알림 파트너 전용(2026-11) — SQL 레벨 보장을 mocked pool로 확인한다.
function makePool(rows: unknown[] = []) {
  const query = jest.fn().mockResolvedValue({ rows, rowCount: rows.length });
  return { pool: { query } as unknown as Pool, query };
}

describe('PgSlotAlertRepository', () => {
  it('findShopPartner — 샵 없으면 null, 있으면 is_partner', async () => {
    const none = makePool([]);
    await expect(new PgSlotAlertRepository(none.pool).findShopPartner('x')).resolves.toBeNull();
    const partner = makePool([{ is_partner: true }]);
    await expect(new PgSlotAlertRepository(partner.pool).findShopPartner('s1')).resolves.toBe(true);
    const normal = makePool([{ is_partner: false }]);
    await expect(new PgSlotAlertRepository(normal.pool).findShopPartner('s2')).resolves.toBe(false);
  });

  it('findActiveMatches — 지금 파트너인 샵(shops.is_partner = true)의 신청만 매칭', async () => {
    const { pool, query } = makePool([]);
    await new PgSlotAlertRepository(pool).findActiveMatches('s1', [{ date: '2026-11-03', time: '14:00' }]);
    const sql = String(query.mock.calls[0][0]).replace(/\s+/g, ' ');
    expect(sql).toContain('JOIN shops s ON s.id = a.shop_id AND s.is_partner = true');
    expect(query.mock.calls[0][1]).toEqual(['s1', ['2026-11-03'], ['14:00']]);
  });

  it('findActiveMatches — 슬롯이 없으면 조회하지 않는다', async () => {
    const { pool, query } = makePool([]);
    await expect(new PgSlotAlertRepository(pool).findActiveMatches('s1', [])).resolves.toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });
});
