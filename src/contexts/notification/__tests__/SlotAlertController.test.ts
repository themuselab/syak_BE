import { Request, Response, NextFunction } from 'express';
import { SlotAlertController } from '../interface/SlotAlertController';
import {
  CreateSlotAlertsUseCase, ListSlotAlertsUseCase, DeleteSlotAlertsUseCase,
} from '../application/SlotAlertUseCases';
import { Errors } from '../../../shared/errors/AppError';

function makeReq(body: unknown = {}): Request {
  return { body, user: { sub: 'u1', provider: 'kakao' } } as unknown as Request;
}
function makeRes() {
  const res = { json: jest.fn(), status: jest.fn(), send: jest.fn() } as unknown as Response;
  (res.status as jest.Mock).mockReturnValue(res);
  return res;
}

function make() {
  const create = { execute: jest.fn().mockResolvedValue({ created: 2 }) } as unknown as CreateSlotAlertsUseCase;
  const list = { execute: jest.fn().mockResolvedValue({ alerts: [] }) } as unknown as ListSlotAlertsUseCase;
  const del = { execute: jest.fn().mockResolvedValue(undefined) } as unknown as DeleteSlotAlertsUseCase;
  return { ctrl: new SlotAlertController(create, list, del), create, list, del };
}

describe('SlotAlertController', () => {
  it('create — 201 { created }', async () => {
    const { ctrl, create } = make();
    const res = makeRes();
    const body = { shopId: 's', date: '2026-10-30', times: ['10:00'] };
    await ctrl.create(makeReq(body), res, jest.fn());
    expect(create.execute).toHaveBeenCalledWith('u1', body);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ created: 2 });
  });

  it('list — 200 { alerts }', async () => {
    const { ctrl } = make();
    const res = makeRes();
    await ctrl.list(makeReq(), res, jest.fn());
    expect(res.json).toHaveBeenCalledWith({ alerts: [] });
  });

  it('remove — 본인 userId와 ids로 삭제 후 204', async () => {
    const { ctrl, del } = make();
    const res = makeRes();
    await ctrl.remove(makeReq({ ids: ['x'] }), res, jest.fn());
    expect(del.execute).toHaveBeenCalledWith('u1', ['x']);
    expect(res.status).toHaveBeenCalledWith(204);
  });

  it('에러는 next로 전달', async () => {
    const { ctrl, create } = make();
    (create.execute as jest.Mock).mockRejectedValue(Errors.validation({ date: 'x' }));
    const next = jest.fn() as NextFunction;
    await ctrl.create(makeReq({}), makeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });
});
