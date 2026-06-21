import { Request, Response, NextFunction } from 'express';
import { AuthController } from '../interface/AuthController';
import { SocialLoginUseCase } from '../application/SocialLoginUseCase';
import { RefreshTokenUseCase } from '../application/RefreshTokenUseCase';
import { SignOutUseCase } from '../application/SignOutUseCase';
import { LinkSocialAccountUseCase } from '../application/LinkSocialAccountUseCase';
import { ErrorCode } from '../../../shared/errors/ErrorCode';

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-32-chars-minimum-ok!';
  process.env.COOKIE_SECURE = 'false';
  process.env.COOKIE_SAME_SITE = 'lax';
});

const mockLoginResult = {
  token: { accessToken: 'at', refreshToken: 'rt', expiresIn: 900 },
  user: { id: 'u1', nickname: '민지', profileImage: null },
  isNewUser: false,
};

function makeReq(overrides: Partial<Request> = {}): Request {
  return { params: {}, body: {}, cookies: {}, user: { sub: 'u1' }, ...overrides } as unknown as Request;
}
function makeRes() {
  const res = {
    status: jest.fn(),
    json: jest.fn(),
    send: jest.fn(),
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  } as unknown as Response;
  (res.status as jest.Mock).mockReturnValue(res);
  return res;
}
function makeNext(): NextFunction { return jest.fn(); }

function makeController() {
  const socialLogin = { execute: jest.fn().mockResolvedValue(mockLoginResult) } as unknown as SocialLoginUseCase;
  const refreshToken = { execute: jest.fn().mockResolvedValue({ accessToken: 'new-at', refreshToken: 'new-rt', expiresIn: 900 }) } as unknown as RefreshTokenUseCase;
  const signOut = { execute: jest.fn().mockResolvedValue(undefined) } as unknown as SignOutUseCase;
  const linkAccount = { execute: jest.fn().mockResolvedValue({ linkedProvider: 'naver' }) } as unknown as LinkSocialAccountUseCase;
  return { ctrl: new AuthController(socialLogin, refreshToken, signOut, linkAccount), socialLogin, refreshToken, signOut, linkAccount };
}

describe('AuthController.login', () => {
  it('카카오 로그인 성공 시 200, 쿠키 설정, user 반환', async () => {
    const { ctrl } = makeController();
    const res = makeRes();
    await ctrl.login(makeReq({ params: { provider: 'kakao' }, body: { access_token: 'tok' } }), res, makeNext());
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.cookie).toHaveBeenCalledWith('syak_access', 'at', expect.objectContaining({ httpOnly: true }));
    expect(res.cookie).toHaveBeenCalledWith('syak_refresh', 'rt', expect.objectContaining({ httpOnly: true }));
    expect(res.json).toHaveBeenCalledWith({ user: mockLoginResult.user, isNewUser: false });
  });

  it('신규 유저이면 201을 반환한다', async () => {
    const { ctrl, socialLogin } = makeController();
    (socialLogin.execute as jest.Mock).mockResolvedValue({ ...mockLoginResult, isNewUser: true });
    const res = makeRes();
    await ctrl.login(makeReq({ params: { provider: 'kakao' }, body: { access_token: 'tok' } }), res, makeNext());
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('지원하지 않는 provider이면 VALIDATION_ERROR를 넘긴다', async () => {
    const { ctrl } = makeController();
    const next = makeNext();
    await ctrl.login(makeReq({ params: { provider: 'google' }, body: { access_token: 'tok' } }), makeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: ErrorCode.VALIDATION_ERROR }));
  });

  it('access_token이 없으면 VALIDATION_ERROR를 넘긴다', async () => {
    const { ctrl } = makeController();
    const next = makeNext();
    await ctrl.login(makeReq({ params: { provider: 'kakao' }, body: {} }), makeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: ErrorCode.VALIDATION_ERROR }));
  });

  it('use case 에러를 next로 전달한다', async () => {
    const { ctrl, socialLogin } = makeController();
    (socialLogin.execute as jest.Mock).mockRejectedValue(new Error('fail'));
    const next = makeNext();
    await ctrl.login(makeReq({ params: { provider: 'kakao' }, body: { access_token: 'tok' } }), makeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

describe('AuthController.refresh', () => {
  it('syak_refresh 쿠키가 없으면 AUTH_REFRESH_INVALID를 넘긴다', async () => {
    const { ctrl } = makeController();
    const next = makeNext();
    await ctrl.refresh(makeReq({ cookies: {} }), makeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: ErrorCode.AUTH_REFRESH_INVALID }));
  });

  it('유효한 refresh 쿠키로 새 토큰 쿠키를 설정하고 204를 반환한다', async () => {
    const { ctrl } = makeController();
    const res = makeRes();
    await ctrl.refresh(makeReq({ cookies: { syak_refresh: 'rt' } }), res, makeNext());
    expect(res.cookie).toHaveBeenCalledWith('syak_access', 'new-at', expect.objectContaining({ httpOnly: true }));
    expect(res.status).toHaveBeenCalledWith(204);
  });
});

describe('AuthController.logout', () => {
  it('로그아웃 시 쿠키를 삭제하고 204를 반환한다', async () => {
    const { ctrl } = makeController();
    const res = makeRes();
    await ctrl.logout(makeReq(), res, makeNext());
    expect(res.clearCookie).toHaveBeenCalledWith('syak_access', expect.any(Object));
    expect(res.clearCookie).toHaveBeenCalledWith('syak_refresh', expect.any(Object));
    expect(res.status).toHaveBeenCalledWith(204);
  });
});
