import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/server';
import { getTestPool, seedShop } from './setup';
import { Pool } from 'pg';

function makeToken(userId: string): string {
  return jwt.sign({ sub: userId, provider: 'kakao' }, process.env.JWT_SECRET!);
}

describe('Favorite E2E', () => {
  let pool: Pool;
  const app = createApp();
  let userId: string;
  let token: string;

  beforeAll(async () => {
    pool = await getTestPool();
    await seedShop(pool);
    const { rows } = await pool.query(
      `INSERT INTO users (nickname) VALUES ('E2E유저') RETURNING id`,
    );
    userId = rows[0].id;
    token = makeToken(userId);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM favorites WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    await pool.query("DELETE FROM shops WHERE id = 'test-shop-1'");
    await pool.end();
  });

  it('인증 없이 접근하면 401을 반환한다', async () => {
    const res = await request(app).get('/api/v1/favorites');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('AUTH_UNAUTHORIZED');
  });

  it('즐겨찾기 추가 → 목록 조회 → 삭제 전체 흐름', async () => {
    // 추가
    const addRes = await request(app)
      .post('/api/v1/favorites/test-shop-1')
      .set('Cookie', `syak_access=${token}`);
    expect(addRes.status).toBe(201);
    expect(addRes.body.shopId).toBe('test-shop-1');

    // 목록
    const listRes = await request(app)
      .get('/api/v1/favorites')
      .set('Cookie', `syak_access=${token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.favorites).toHaveLength(1);

    // 중복 추가 → 409
    const dupRes = await request(app)
      .post('/api/v1/favorites/test-shop-1')
      .set('Cookie', `syak_access=${token}`);
    expect(dupRes.status).toBe(409);
    expect(dupRes.body.code).toBe('FAVORITE_ALREADY_EXISTS');

    // 삭제
    const delRes = await request(app)
      .delete('/api/v1/favorites/test-shop-1')
      .set('Cookie', `syak_access=${token}`);
    expect(delRes.status).toBe(204);

    // 없는거 삭제 → 404
    const del2Res = await request(app)
      .delete('/api/v1/favorites/test-shop-1')
      .set('Cookie', `syak_access=${token}`);
    expect(del2Res.status).toBe(404);
    expect(del2Res.body.code).toBe('FAVORITE_NOT_FOUND');
  });
});
