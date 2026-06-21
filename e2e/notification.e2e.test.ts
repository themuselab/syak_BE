import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/server';
import { getTestPool } from './setup';
import { Pool } from 'pg';

function makeToken(userId: string): string {
  return jwt.sign({ sub: userId, provider: 'kakao' }, process.env.JWT_SECRET!);
}

describe('Notification E2E', () => {
  let pool: Pool;
  const app = createApp();
  let userId: string;
  let token: string;

  beforeAll(async () => {
    pool = await getTestPool();
    const { rows } = await pool.query(
      `INSERT INTO users (nickname) VALUES ('알림유저') RETURNING id`,
    );
    userId = rows[0].id;
    token = makeToken(userId);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM notification_settings WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    await pool.end();
  });

  it('알림 목록을 반환한다', async () => {
    const res = await request(app)
      .get('/api/v1/notifications')
      .set('Cookie', `syak_access=${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('notifications');
    expect(Array.isArray(res.body.notifications)).toBe(true);
  });

  it('알림 설정을 조회하고 업데이트한다', async () => {
    const getRes = await request(app)
      .get('/api/v1/notifications/settings')
      .set('Cookie', `syak_access=${token}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body).toHaveProperty('nearEnabled');

    const patchRes = await request(app)
      .patch('/api/v1/notifications/settings')
      .set('Cookie', `syak_access=${token}`)
      .send({ radiusKm: 5, nearEnabled: false });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.radiusKm).toBe(5);
  });

  it('반경이 유효 범위를 벗어나면 400을 반환한다', async () => {
    const res = await request(app)
      .patch('/api/v1/notifications/settings')
      .set('Cookie', `syak_access=${token}`)
      .send({ radiusKm: 99 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('내부 API 키 없이 dispatch 호출하면 403을 반환한다', async () => {
    const res = await request(app)
      .post('/api/v1/notifications/internal/dispatch')
      .send({ events: [] });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('INTERNAL_KEY_INVALID');
  });

  it('올바른 내부 API 키로 dispatch를 호출한다', async () => {
    const res = await request(app)
      .post('/api/v1/notifications/internal/dispatch')
      .set('X-Internal-Key', process.env.INTERNAL_API_KEY!)
      .send({ events: [] });
    expect(res.status).toBe(200);
    expect(res.body.dispatched).toBe(0);
  });
});
