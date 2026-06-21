import request from 'supertest';
import { createApp } from '../src/server';
import { getTestPool, seedShop } from './setup';
import { Pool } from 'pg';

describe('Catalog E2E', () => {
  let pool: Pool;
  const app = createApp();

  beforeAll(async () => {
    pool = await getTestPool();
    await seedShop(pool);
  });

  afterAll(async () => {
    await pool.query("DELETE FROM shops WHERE id = 'test-shop-1'");
    await pool.end();
  });

  describe('GET /api/v1/shops', () => {
    it('샵 목록을 반환한다', async () => {
      const res = await request(app).get('/api/v1/shops');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('items');
      expect(res.body).toHaveProperty('total');
      expect(Array.isArray(res.body.items)).toBe(true);
    });

    it('districts 필터가 동작한다', async () => {
      const res = await request(app).get(`/api/v1/shops?districts=${encodeURIComponent('강남구')}`);
      expect(res.status).toBe(200);
      expect(res.status).toBe(200);
      res.body.items.forEach((shop: { district: string | null }) => {
        expect(shop.district).toBe('강남구');
      });
    });

    it('limit이 100을 넘어도 최대 100개만 반환한다', async () => {
      const res = await request(app).get('/api/v1/shops?limit=999');
      expect(res.status).toBe(200);
      expect(res.body.limit).toBe(100);
    });
  });

  describe('GET /api/v1/shops/:shopId', () => {
    it('존재하는 샵 상세를 반환한다', async () => {
      const res = await request(app).get('/api/v1/shops/test-shop-1');
      expect(res.status).toBe(200);
      expect(res.body.id).toBe('test-shop-1');
      expect(res.body.name).toBe('테스트샵');
    });

    it('존재하지 않는 샵은 404를 반환한다', async () => {
      const res = await request(app).get('/api/v1/shops/non-existent');
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('SHOP_NOT_FOUND');
      expect(res.body.message).toBeTruthy();
    });
  });
});
