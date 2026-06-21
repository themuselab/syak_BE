import { Request, Response, NextFunction } from 'express';
import { ReservationController } from '../interface/ReservationController';
import { GetShopSlotsUseCase } from '../application/GetShopSlotsUseCase';
import { SearchAvailableSlotsUseCase } from '../application/SearchAvailableSlotsUseCase';

function makeReq(overrides: Partial<Request> = {}): Request {
  return { params: {}, query: {}, ...overrides } as unknown as Request;
}
function makeRes() {
  const res = { json: jest.fn() } as unknown as Response;
  return res;
}
function makeNext(): NextFunction { return jest.fn(); }

function makeController() {
  const getSlots = { execute: jest.fn().mockResolvedValue([{ shopId: 's1', date: '2025-01-01', startTime: '14:00' }]) } as unknown as GetShopSlotsUseCase;
  const search = { execute: jest.fn().mockResolvedValue([]) } as unknown as SearchAvailableSlotsUseCase;
  return { ctrl: new ReservationController(getSlots, search), getSlots, search };
}

describe('ReservationController.shopSlots', () => {
  it('샵 슬롯을 반환한다', async () => {
    const { ctrl } = makeController();
    const res = makeRes();
    await ctrl.shopSlots(makeReq({ params: { shopId: 's1' } }), res, makeNext());
    expect(res.json).toHaveBeenCalledWith({ slots: expect.any(Array) });
  });

  it('dates 쿼리를 콤마로 분리해서 use case에 전달한다', async () => {
    const { ctrl, getSlots } = makeController();
    await ctrl.shopSlots(makeReq({ params: { shopId: 's1' }, query: { dates: '2025-01-01,2025-01-02' } }), makeRes(), makeNext());
    expect(getSlots.execute).toHaveBeenCalledWith('s1', ['2025-01-01', '2025-01-02']);
  });
});

describe('ReservationController.search', () => {
  it('빈자리 검색 결과를 반환한다', async () => {
    const { ctrl } = makeController();
    const res = makeRes();
    await ctrl.search(makeReq({ query: { dates: '2025-01-01', times: '14:00' } }), res, makeNext());
    expect(res.json).toHaveBeenCalledWith({ shops: [], count: 0 });
  });

  it('use case 에러를 next로 전달한다', async () => {
    const { ctrl, search } = makeController();
    (search.execute as jest.Mock).mockRejectedValue(new Error('fail'));
    const next = makeNext();
    await ctrl.search(makeReq({ query: { dates: '', times: '' } }), makeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});
