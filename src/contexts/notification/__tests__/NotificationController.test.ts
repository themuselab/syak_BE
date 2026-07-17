import { Request, Response, NextFunction } from 'express';
import { NotificationController } from '../interface/NotificationController';
import { GetNotificationsUseCase } from '../application/GetNotificationsUseCase';
import { GetSettingsUseCase } from '../application/GetSettingsUseCase';
import { UpdateSettingsUseCase } from '../application/UpdateSettingsUseCase';
import { DispatchSlotNotificationsUseCase } from '../application/DispatchSlotNotificationsUseCase';
import { NotificationSettings } from '../domain/NotificationSettings';
import { ErrorCode } from '../../../shared/errors/ErrorCode';
import { Errors } from '../../../shared/errors/AppError';

const mockSettings: NotificationSettings = {
  userId: 'u1', nearEnabled: true, nearLat: 37.5, nearLng: 127.0,
  radiusKm: 3, favoriteEnabled: true, shopNewsEnabled: false, fcmToken: null, updatedAt: new Date(),
};

function makeReq(overrides: Partial<Request> = {}): Request {
  return { body: {}, user: { sub: 'u1', provider: 'kakao' }, ...overrides } as unknown as Request;
}
function makeRes() {
  const res = { json: jest.fn(), status: jest.fn() } as unknown as Response;
  (res.status as jest.Mock).mockReturnValue(res);
  return res;
}
function makeNext(): NextFunction { return jest.fn(); }

function makeController() {
  const getNotifs = { execute: jest.fn().mockResolvedValue([]) } as unknown as GetNotificationsUseCase;
  const getSettings = { execute: jest.fn().mockResolvedValue(mockSettings) } as unknown as GetSettingsUseCase;
  const updateSettings = { execute: jest.fn().mockResolvedValue(mockSettings) } as unknown as UpdateSettingsUseCase;
  const dispatch = { execute: jest.fn().mockResolvedValue({ dispatched: 2 }) } as unknown as DispatchSlotNotificationsUseCase;
  const noop = { execute: jest.fn().mockResolvedValue(undefined) } as never;
  const ctrl = new NotificationController(
    getNotifs, getSettings, updateSettings, dispatch,
    noop, noop, noop, noop, // markRead, registerDevice, listAppNews, publishAppNews
  );
  return { ctrl, getNotifs, getSettings, updateSettings, dispatch };
}

describe('NotificationController', () => {
  it('list — 알림 목록을 반환한다', async () => {
    const { ctrl } = makeController();
    const res = makeRes();
    await ctrl.list(makeReq(), res, makeNext());
    expect(res.json).toHaveBeenCalledWith({ notifications: [] });
  });

  it('settings — 알림 설정을 반환한다', async () => {
    const { ctrl } = makeController();
    const res = makeRes();
    await ctrl.settings(makeReq(), res, makeNext());
    expect(res.json).toHaveBeenCalledWith(mockSettings);
  });

  it('updateSettingsHandler — 설정을 업데이트한다', async () => {
    const { ctrl } = makeController();
    const res = makeRes();
    await ctrl.updateSettingsHandler(makeReq({ body: { radiusKm: 5 } }), res, makeNext());
    expect(res.json).toHaveBeenCalledWith(mockSettings);
  });

  it('updateSettingsHandler — 에러를 next로 전달한다', async () => {
    const { ctrl, updateSettings } = makeController();
    (updateSettings.execute as jest.Mock).mockRejectedValue(Errors.validation({ radiusKm: '범위 초과' }));
    const next = makeNext();
    await ctrl.updateSettingsHandler(makeReq({ body: { radiusKm: 99 } }), makeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: ErrorCode.VALIDATION_ERROR }));
  });

  it('dispatchHandler — dispatched 결과를 반환한다', async () => {
    const { ctrl } = makeController();
    const res = makeRes();
    await ctrl.dispatchHandler(makeReq({ body: { events: [] } }), res, makeNext());
    expect(res.json).toHaveBeenCalledWith({ dispatched: 2 });
  });
});
