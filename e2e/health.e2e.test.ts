import request from 'supertest';
import { createApp } from '../src/server';

describe('Health check', () => {
  const app = createApp();

  it('GET /api/v1/health → 200 ok', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
