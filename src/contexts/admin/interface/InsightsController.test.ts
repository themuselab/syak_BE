import express from 'express';
import request from 'supertest';
import { InsightsController } from './InsightsController';
import { Pool } from 'pg';

describe('anonymous analytics intake', () => {
  const query = jest.fn().mockResolvedValue({});
  const controller = new InsightsController({ query } as unknown as Pool);
  const app = express(); app.use(express.json()); app.post('/events', controller.collect);
  const event = () => ({ event_id: 'f2d23373-468b-4496-9f61-1aac05535367', session_id: 'session123456', event_name: 'reserve_click', platform: 'web', ts: Date.now(), shop_id: '12345', shop_type: 'partner', reservation_method: 'naver' });
  beforeEach(() => query.mockClear());
  it('persists only approved fields with deduplication', async () => {
    await request(app).post('/events').send({ events: [{...event(), email: 'private@example.com', properties: { secret: 'password' } }] }).expect(204);
    expect(query.mock.calls[0][0]).toContain('ON CONFLICT (event_id) DO NOTHING');
    expect(query.mock.calls[0][1][0]).not.toContain('private@example.com');
    expect(query.mock.calls[0][1][0]).not.toContain('password');
  });
  it('rejects stale event batches without inserting partial data', async () => {
    await request(app).post('/events').send({ events: [event(), {...event(), ts: 0}] }).expect(400);
    expect(query).not.toHaveBeenCalled();
  });
  it('rejects invalid platforms and excessive batches', async () => {
    await request(app).post('/events').send({ events: [{...event(),platform:'private'}] }).expect(400);
    await request(app).post('/events').send({ events: Array.from({length:21},event) }).expect(400);
    expect(query).not.toHaveBeenCalled();
  });
});
