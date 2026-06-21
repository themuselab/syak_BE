import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { requireAuth, requireInternalKey } from '../auth.middleware';
import { ErrorCode } from '../../errors/ErrorCode';

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-32-chars-minimum-ok!';
  process.env.INTERNAL_API_KEY = 'test-internal-key';
});

function makeReq(overrides: Partial<Request> = {}): Request {
  return { cookies: {}, headers: {}, ...overrides } as unknown as Request;
}
function makeRes(): Response { return {} as Response; }
function makeNext(): NextFunction { return jest.fn(); }

describe('requireAuth', () => {
  it('쿠키가 없으면 AUTH_UNAUTHORIZED 에러를 넘긴다', () => {
    const next = makeNext();
    requireAuth(makeReq(), makeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: ErrorCode.AUTH_UNAUTHORIZED }));
  });

  it('유효한 JWT 쿠키로 req.user가 설정되고 next()가 호출된다', () => {
    const token = jwt.sign({ sub: 'user-1', provider: 'kakao' }, process.env.JWT_SECRET!);
    const next = makeNext();
    const req = makeReq({ cookies: { syak_access: token } });
    requireAuth(req, makeRes(), next);
    expect(req.user).toEqual(expect.objectContaining({ sub: 'user-1' }));
    expect(next).toHaveBeenCalledWith();
  });

  it('만료된 JWT이면 AUTH_TOKEN_EXPIRED 에러를 넘긴다', () => {
    const token = jwt.sign({ sub: 'user-1' }, process.env.JWT_SECRET!, { expiresIn: -1 });
    const next = makeNext();
    requireAuth(makeReq({ cookies: { syak_access: token } }), makeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: ErrorCode.AUTH_TOKEN_EXPIRED }));
  });

  it('잘못된 서명의 JWT이면 AUTH_INVALID_TOKEN 에러를 넘긴다', () => {
    const token = jwt.sign({ sub: 'user-1' }, 'wrong-secret');
    const next = makeNext();
    requireAuth(makeReq({ cookies: { syak_access: token } }), makeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: ErrorCode.AUTH_INVALID_TOKEN }));
  });
});

describe('requireInternalKey', () => {
  it('올바른 internal key이면 next()를 호출한다', () => {
    const next = makeNext();
    requireInternalKey(makeReq({ headers: { 'x-internal-key': 'test-internal-key' } }), makeRes(), next);
    expect(next).toHaveBeenCalledWith();
  });

  it('잘못된 internal key이면 INTERNAL_KEY_INVALID 에러를 넘긴다', () => {
    const next = makeNext();
    requireInternalKey(makeReq({ headers: { 'x-internal-key': 'wrong' } }), makeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: ErrorCode.INTERNAL_KEY_INVALID }));
  });

  it('헤더가 없으면 INTERNAL_KEY_INVALID 에러를 넘긴다', () => {
    const next = makeNext();
    requireInternalKey(makeReq(), makeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: ErrorCode.INTERNAL_KEY_INVALID }));
  });
});
