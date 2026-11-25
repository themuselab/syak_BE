import { Pool } from 'pg';
import { Request, Response } from 'express';
import { WebCatalogController } from '../interface/WebCatalogController';
import { PgShopRepository } from '../infrastructure/PgShopRepository';
import { PgSlotRepository } from '../../reservation/infrastructure/PgSlotRepository';
import { ICacheService } from '../../../shared/cache/ICacheService';
import { isExcludedShop, PUBLIC_SHOP_SQL, EXCLUDED_SHOP_IDS } from '../../../shared/catalog-exclusions';

it('keeps unrelated legitimate shops and excludes the reviewed plumbing listing', async () => {
  expect(isExcludedShop('1561251960')).toBe(true);
  expect(isExcludedShop('1225759020')).toBe(true);
  expect(isExcludedShop('1001548336')).toBe(true);
  expect(EXCLUDED_SHOP_IDS).toHaveLength(365);
  expect(new Set(EXCLUDED_SHOP_IDS).size).toBe(365);
  expect(isExcludedShop('37445846')).toBe(true);
  expect(isExcludedShop('1068874238')).toBe(true);
  expect(isExcludedShop('new-id', '코웨이정수기.룰루비데.공기청정기.비렉스마사지셋.매트리스.렌탈')).toBe(true);
  expect(isExcludedShop('31572101', '헬스케어')).toBe(true);
  expect(isExcludedShop('1685687060', '두손헬스케어 안마원')).toBe(false);
  expect(isExcludedShop('1906094879', '수 중국상사')).toBe(false);
  expect(isExcludedShop('future-import-id', '반영구시트옥상방수누수공사')).toBe(true);
  expect(isExcludedShop('real-shop', '반영구 뷰티샵')).toBe(false);
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

it('serves a complete detail for newly registered partners without an old snapshot', async () => {
  const query = jest.fn().mockResolvedValue({ rows: [{ id: 'new-partner', name: '테라리온',
    category: '마사지', categories: ['마사지'], gu: '수원시', lat: 37, lng: 127,
    review_count: 178, detail: { roadAddress: '수원시 매장 주소', images: { gallery: [] } },
  }] });
  const res = { json: jest.fn() } as unknown as Response;
  await new WebCatalogController({ query } as unknown as Pool).detail(
    { params: { shopId: 'new-partner' } } as unknown as Request, res, jest.fn());
  expect((res.json as jest.Mock).mock.calls[0][0][0].detail).toMatchObject({
    id: 'new-partner', name: '테라리온', category: '마사지', reviewTotal: 178,
    roadAddress: '수원시 매장 주소', menus: [], reviews: [], reservationRoutes: [],
    images: { gallery: [], menu: [], review: [] },
  });
});
