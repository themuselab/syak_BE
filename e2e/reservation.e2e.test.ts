import request from 'supertest';
import { createApp } from '../src/server';
import { getTestPool, seedShop, seedSlot } from './setup';
import { Pool } from 'pg';

describe('Reservation E2E', () => {
  let pool: Pool;
  const app = createApp();
  const today = new Date().toISOString().slice(0, 10);

  beforeAll(async () => {
    pool = await getTestPool();
    await seedShop(pool);
    await seedSlot(pool);
  });

  afterAll(async () => {
    await pool.query("DELETE FROM slots WHERE shop_id = 'test-shop-1'");
    await pool.query("DELETE FROM shops WHERE id = 'test-shop-1'");
    await pool.end();
  });

  describe('GET /api/v1/slots/shop/:shopId', () => {
    it('샵의 슬롯 목록을 반환한다', async () => {
      const res = await request(app).get('/api/v1/slots/shop/test-shop-1');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('slots');
      expect(Array.isArray(res.body.slots)).toBe(true);
    });
  });

  describe('GET /api/v1/slots/search', () => {
    it('날짜와 시간으로 빈자리를 검색한다', async () => {
      const res = await request(app)
        .get(`/api/v1/slots/search?dates=${today}&times=14:00`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('shops');
      expect(res.body).toHaveProperty('count');
    });

    it('dates가 없으면 400을 반환한다', async () => {
      const res = await request(app).get('/api/v1/slots/search?times=14:00');
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('times가 없으면 400을 반환한다', async () => {
      const res = await request(app).get(`/api/v1/slots/search?dates=${today}`);
      expect(res.status).toBe(400);
    });
  });
});
