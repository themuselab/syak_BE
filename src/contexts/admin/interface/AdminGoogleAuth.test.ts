import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { adminGoogleAuth, ADMIN_GOOGLE_EMAIL, verifyAdminSession } from './AdminGoogleAuth';
import { requireAdminAuth } from '../../../shared/middleware/admin-auth.middleware';

jest.mock('google-auth-library', () => ({ OAuth2Client: jest.fn().mockImplementation(() => ({ verifyIdToken: jest.fn() })) }));
const verify = (OAuth2Client as unknown as jest.Mock).mock.results[0].value.verifyIdToken as jest.Mock;
const app = express(); app.use(express.json(), cookieParser());
app.get('/config', adminGoogleAuth.config); app.post('/login', adminGoogleAuth.login);
app.get('/protected', requireAdminAuth, (_req, res) => { res.json({ ok: true }); });
app.use((_err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => { res.sendStatus(401); });
const env = { ...process.env };
beforeEach(() => { process.env.ADMIN_SESSION_SECRET = 'test-admin-secret-32-characters-long'; process.env.ADMIN_GOOGLE_CLIENT_ID = 'admin-client'; verify.mockReset(); });
afterAll(() => { process.env = env; });
async function challenge() {
  const r = await request(app).get('/config');
  return { nonce: r.body.nonce as string, cookie: r.headers['set-cookie'][0].split(';')[0] };
}
test('verified allowed Google account receives bounded admin-only session', async () => {
  const c = await challenge();
  verify.mockResolvedValue({ getPayload: () => ({ sub: 'google-user', email: ADMIN_GOOGLE_EMAIL, email_verified: true, nonce: c.nonce }) });
  const r = await request(app).post('/login').set('Cookie', c.cookie).send({ credential: 'signed-google-id-token' });
  expect(r.status).toBe(200); expect(verify).toHaveBeenCalledWith({ idToken: 'signed-google-id-token', audience: 'admin-client' });
  const cookie = (r.headers['set-cookie'] as unknown as string[]).find(x => x.startsWith('syak_admin='))!;
  expect(cookie).toContain('HttpOnly'); expect(cookie).toContain('SameSite=Strict');
  const token = cookie.split(';')[0].slice('syak_admin='.length);
  expect(verifyAdminSession(token)).toBe(true);
  const p = jwt.decode(token) as jwt.JwtPayload; expect(p.exp! - p.iat!).toBe(8 * 3600);
  expect((await request(app).get('/protected').set('Cookie', cookie.split(';')[0])).status).toBe(200);
});
test.each([
  { email: 'someone@gmail.com', email_verified: true },
  { email: 'themuselab.contact@gmail.com.attacker.example', email_verified: true },
  { email: ADMIN_GOOGLE_EMAIL, email_verified: false },
])('rejects unauthorized identity %j', async identity => {
  const c = await challenge(); verify.mockResolvedValue({ getPayload: () => ({ sub: 'user', nonce: c.nonce, ...identity }) });
  expect((await request(app).post('/login').set('Cookie', c.cookie).send({ credential: 'token' })).status).toBe(403);
});
test('rejects missing challenge, mismatched nonce and forged Google tokens', async () => {
  expect((await request(app).post('/login').send({ credential: 'token' })).status).toBe(401); expect(verify).not.toHaveBeenCalled();
  const c = await challenge(); verify.mockResolvedValue({ getPayload: () => ({ sub: 'user', email: ADMIN_GOOGLE_EMAIL, email_verified: true, nonce: 'wrong' }) });
  expect((await request(app).post('/login').set('Cookie', c.cookie).send({ credential: 'token' })).status).toBe(403);
  verify.mockRejectedValue(new Error('signature/audience/expiry verification failed'));
  expect((await request(app).post('/login').set('Cookie', c.cookie).send({ credential: 'forged' })).status).toBe(401);
});
test('old fixed token, consumer JWT, expired session and challenge cannot access admin', async () => {
  const c = await challenge();
  const sign = (claims: object, opts: jwt.SignOptions = {}) => jwt.sign(claims, process.env.ADMIN_SESSION_SECRET!, opts);
  const tokens = ['old-static-admin-token', sign({ sub: 'consumer' }), c.cookie.split('=')[1], sign({ kind: 'admin-session', email: ADMIN_GOOGLE_EMAIL }, { issuer: 'syak-admin', audience: 'syak-admin-console', subject: 'user', expiresIn: -1 })];
  for (const token of tokens) expect((await request(app).get('/protected').set('Cookie', `syak_admin=${token}`)).status).toBe(401);
});
test('missing server configuration fails closed', async () => {
  delete process.env.ADMIN_GOOGLE_CLIENT_ID; expect((await request(app).get('/config')).status).toBe(503);
  process.env.ADMIN_GOOGLE_CLIENT_ID = 'admin-client'; delete process.env.ADMIN_SESSION_SECRET;
  expect((await request(app).get('/config')).status).toBe(503);
});
