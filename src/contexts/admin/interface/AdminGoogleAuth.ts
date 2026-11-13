import { randomBytes } from 'crypto';
import { Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';

export const ADMIN_GOOGLE_EMAIL = 'themuselab.contact@gmail.com';
const client = new OAuth2Client();
const issuer = 'syak-admin';
const audience = 'syak-admin-console';
function secret(): string {
  const value = process.env.ADMIN_SESSION_SECRET;
  if (!value || value.length < 32) throw new Error('Admin session secret missing');
  return value;
}
const cookieOptions = () => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true', sameSite: 'strict' as const, path: '/' });
export function verifyAdminSession(token: string): boolean {
  try {
    const p = jwt.verify(token, secret(), { algorithms: ['HS256'], issuer, audience }) as jwt.JwtPayload;
    return p.kind === 'admin-session' && p.email === ADMIN_GOOGLE_EMAIL && typeof p.sub === 'string' && !!p.sub && typeof p.exp === 'number';
  } catch { return false; }
}
export const adminGoogleAuth = {
  config: (_req: Request, res: Response): void => {
    res.setHeader('Cache-Control', 'no-store');
    if (!process.env.ADMIN_GOOGLE_CLIENT_ID) { res.status(503).json({ message: 'Google 관리자 로그인 설정이 필요합니다.' }); return; }
    try {
      const nonce = randomBytes(32).toString('hex');
      const challenge = jwt.sign({ kind: 'google-challenge', nonce }, secret(), { algorithm: 'HS256', issuer, audience, expiresIn: '5m' });
      res.cookie('syak_admin_google', challenge, { ...cookieOptions(), maxAge: 5 * 60 * 1000 });
      res.json({ clientId: process.env.ADMIN_GOOGLE_CLIENT_ID, nonce });
    } catch { res.status(503).json({ message: 'Google 관리자 로그인 설정이 필요합니다.' }); }
  },
  login: async (req: Request, res: Response): Promise<void> => {
    res.setHeader('Cache-Control', 'no-store');
    res.clearCookie('syak_admin_google', cookieOptions());
    try {
      if (!process.env.ADMIN_GOOGLE_CLIENT_ID || typeof req.body.credential !== 'string' || req.body.credential.length > 10000) throw new Error('Invalid request');
      const challenge = jwt.verify(req.cookies?.syak_admin_google ?? '', secret(), { algorithms: ['HS256'], issuer, audience }) as jwt.JwtPayload;
      if (challenge.kind !== 'google-challenge' || typeof challenge.nonce !== 'string') throw new Error('Invalid challenge');
      const ticket = await client.verifyIdToken({ idToken: req.body.credential, audience: process.env.ADMIN_GOOGLE_CLIENT_ID });
      const p = ticket.getPayload();
      if (!p || !p.sub || p.email_verified !== true || p.email !== ADMIN_GOOGLE_EMAIL || (p as typeof p & { nonce?: string }).nonce !== challenge.nonce) {
        res.status(403).json({ code: 'ADMIN_FORBIDDEN', message: '허용된 Muse Lab Google 계정으로 로그인해 주세요.' }); return;
      }
      const session = jwt.sign({ kind: 'admin-session', email: ADMIN_GOOGLE_EMAIL }, secret(), { algorithm: 'HS256', subject: p.sub, issuer, audience, expiresIn: '8h' });
      res.cookie('syak_admin', session, { ...cookieOptions(), maxAge: 8 * 60 * 60 * 1000 });
      res.json({ ok: true });
    } catch { res.status(401).json({ code: 'ADMIN_UNAUTHORIZED', message: '로그인 확인에 실패했어요. 페이지를 새로고침해 다시 시도해 주세요.' }); }
  },
};
