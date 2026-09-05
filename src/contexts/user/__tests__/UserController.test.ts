import { Request, Response, NextFunction } from 'express';
import { UserController } from '../interface/UserController';
import { GetProfileUseCase } from '../application/GetProfileUseCase';
import { UpdateProfileUseCase } from '../application/UpdateProfileUseCase';
import { WithdrawUseCase } from '../application/WithdrawUseCase';
import { UserProfile } from '../domain/UserProfile';

const mockProfile: UserProfile = { id: 'u1', linkedProviders: ['kakao'], nickname: '민지', profileImage: null, createdAt: new Date() };

function makeReq(overrides: Partial<Request> = {}): Request {
  return { user: { sub: 'u1' }, ...overrides } as unknown as Request;
}
function makeRes() {
  const res = { json: jest.fn(), status: jest.fn(), send: jest.fn() } as unknown as Response;
  (res.status as jest.Mock).mockReturnValue(res);
  return res;
}
function makeNext(): NextFunction { return jest.fn(); }

function makeController() {
  const getProfile = { execute: jest.fn().mockResolvedValue(mockProfile) } as unknown as GetProfileUseCase;
  const updateProfile = { execute: jest.fn().mockResolvedValue(mockProfile) } as unknown as UpdateProfileUseCase;
  const withdraw = { execute: jest.fn().mockResolvedValue(undefined) } as unknown as WithdrawUseCase;
  return { ctrl: new UserController(getProfile, updateProfile, withdraw), getProfile, updateProfile, withdraw };
}

describe('UserController', () => {
  it('me — 프로필을 반환한다', async () => {
    const { ctrl } = makeController();
    const res = makeRes();
    await ctrl.me(makeReq(), res, makeNext());
    expect(res.json).toHaveBeenCalledWith(mockProfile);
  });

  it('me — use case 에러를 next로 전달한다', async () => {
    const { ctrl, getProfile } = makeController();
    (getProfile.execute as jest.Mock).mockRejectedValue(new Error('not found'));
    const next = makeNext();
    await ctrl.me(makeReq(), makeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it('updateProfile — 갱신된 프로필을 반환한다', async () => {
    const { ctrl, updateProfile } = makeController();
    const res = makeRes();
    await ctrl.updateProfile(makeReq({ body: { nickname: '새닉네임' } }), res, makeNext());
    expect(updateProfile.execute).toHaveBeenCalledWith('u1', '새닉네임');
    expect(res.json).toHaveBeenCalledWith(mockProfile);
  });

  it('updateProfile — nickname이 문자열이 아니면 validation 에러를 next로 전달', async () => {
    const { ctrl } = makeController();
    const next = makeNext();
    await ctrl.updateProfile(makeReq({ body: {} }), makeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it('withdraw — 204를 반환한다', async () => {
    const { ctrl } = makeController();
    const res = makeRes();
    await ctrl.withdraw(makeReq(), res, makeNext());
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.send).toHaveBeenCalled();
  });

  it('withdraw — use case 에러를 next로 전달한다', async () => {
    const { ctrl, withdraw } = makeController();
    (withdraw.execute as jest.Mock).mockRejectedValue(new Error('db error'));
    const next = makeNext();
    await ctrl.withdraw(makeReq(), makeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});
