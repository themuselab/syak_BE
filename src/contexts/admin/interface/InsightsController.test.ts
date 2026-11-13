import express from 'express';
import request from 'supertest';
import { InsightsController } from './InsightsController';
import { Pool } from 'pg';

describe('retired internal analytics intake', () => {
  it('acknowledges cached old clients without writing any events', async () => {
    const query = jest.fn();
    const controller = new InsightsController({ query } as unknown as Pool);
    const app = express(); app.use(express.json()); app.post('/events', controller.collect);
    await request(app).post('/events').send({ events: [{ event_name: 'service_enter', session_id: 'old-session' }] }).expect(204);
    expect(query).not.toHaveBeenCalled();
  });
  it('rejects unsupported GA periods and shop types without querying', async () => {
    const query = jest.fn();
    const controller = new InsightsController({ query } as unknown as Pool);
    const app = express(); app.get('/funnel', controller.funnel);
    await request(app).get('/funnel?days=-1').expect(400);
    await request(app).get('/funnel?shopType=other').expect(400);
    expect(query).not.toHaveBeenCalled();
  });
});
