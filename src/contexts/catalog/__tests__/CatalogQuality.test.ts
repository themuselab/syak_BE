import { Pool } from 'pg';
import { Request, Response } from 'express';
import { WebCatalogController } from '../interface/WebCatalogController';
import { PgShopRepository } from '../infrastructure/PgShopRepository';
import { PgSlotRepository } from '../../reservation/infrastructure/PgSlotRepository';
import { ICacheService } from '../../../shared/cache/ICacheService';
import { isExcludedShop, PUBLIC_SHOP_SQL } from '../../../shared/catalog-exclusions';

it('keeps unrelated legitimate shops and excludes the reviewed plumbing listing', async () => {
  expect(isExcludedShop('1561251960')).toBe(true);
  expect(isExcludedShop('1225759020')).toBe(true);
  expect(isExcludedShop('1327515760')).toBe(false);
  const query = jest.fn();
  const cache = { get: jest.fn() } as unknown as ICacheService;
  const pool = { query } as unknown as Pool;
  expect(await new PgShopRepository(pool, cache).findById('1561251960')).toBeNull();
  expect(await new PgSlotRepository(pool, cache).findByShop('1561251960', ['2026-11-17'])).toEqual([]);
  expect(query).not.toHaveBeenCalled();
  expect(cache.get).not.toHaveBeenCalled();
});

it('applies the exclusion before pagination on every public web catalog surface', async () => {
  const query = jest.fn().mockResolvedValue({ rows: [] });
  const controller = new WebCatalogController({ query } as unknown as Pool);
  const req = { query: { gus: '서초구', q: '누수' }, params: { shopId: '1561251960' } } as unknown as Request;
  const res = { json: jest.fn() } as unknown as Response;
  const next = jest.fn();
  for (const method of ['inBounds', 'pins', 'byGus', 'partners', 'search', 'detail'] as const) {
    await controller[method](req, res, next);
    expect(query.mock.calls[query.mock.calls.length - 1][0]).toContain(`WHERE ${PUBLIC_SHOP_SQL}`);
  }
  expect(next).not.toHaveBeenCalled();
});

it('cleans old web detail gallery and representative images', async () => {
  const query = jest.fn().mockResolvedValue({ rows: [{ detail: { images: {
    representative: 'https://maps-service.pstatic.net/maps-cms/banner.png',
    gallery: ['https://ldb-phinf.pstatic.net/shop.jpg', 'https://phinf.pstatic.net/contact/avatar.jpg'],
  } } }] });
  const controller = new WebCatalogController({ query } as unknown as Pool);
  const res = { json: jest.fn() } as unknown as Response;
  await controller.detail({ params: { shopId: '1327515760' } } as unknown as Request, res, jest.fn());
  expect((res.json as jest.Mock).mock.calls[0][0][0].detail.images).toMatchObject({
    gallery: ['https://ldb-phinf.pstatic.net/shop.jpg'], representative: 'https://ldb-phinf.pstatic.net/shop.jpg',
  });
});
