import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { optionalAuth } from '../../../shared/middleware/auth.middleware';

describe('optionalAuth (샵 상세/예약 클릭 추적용)', () => {
  const OLD = process.env.JWT_SECRET;
  beforeAll(() => { process.env.JWT_SECRET = 'test-secret'; });
  afterAll(() => { process.env.JWT_SECRET = OLD; });

  const run = (cookies?: Record<string, string>) => {
    const req = { cookies } as unknown as Request;
    const next = jest.fn();
    optionalAuth(req, {} as Response, next);
    return { req, next };
  };

  it('유효한 access 쿠키면 req.user 를 채운다', () => {
    const token = jwt.sign({ sub: 'user-1' }, 'test-secret');
    const { req, next } = run({ syak_access: token });
    expect(req.user?.sub).toBe('user-1');
    expect(next).toHaveBeenCalledWith();
  });

  it('쿠키가 없으면 비로그인으로 통과', () => {
    const { req, next } = run(undefined);
    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalledWith();
  });

  it('무효/만료 토큰도 거절하지 않고 통과', () => {
    const expired = jwt.sign({ sub: 'user-1', exp: Math.floor(Date.now() / 1000) - 10 }, 'test-secret');
    for (const t of ['garbage', expired, jwt.sign({ sub: 'x' }, 'other-secret')]) {
      const { req, next } = run({ syak_access: t });
      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalledWith();
    }
  });
});
