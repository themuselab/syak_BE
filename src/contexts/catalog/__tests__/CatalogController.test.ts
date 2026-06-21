import { Request, Response, NextFunction } from 'express';
import { CatalogController } from '../interface/CatalogController';
import { GetShopsUseCase } from '../application/GetShopsUseCase';
import { GetShopDetailUseCase } from '../application/GetShopDetailUseCase';
import { ErrorCode } from '../../../shared/errors/ErrorCode';
import { Errors } from '../../../shared/errors/AppError';

const mockList = { items: [], total: 0, page: 1, limit: 20 };
const mockShop = { id: 's1', name: '테스트샵' };

function makeReq(overrides: Partial<Request> = {}): Request {
  return { params: {}, query: {}, ...overrides } as unknown as Request;
}
function makeRes() {
  const res = { json: jest.fn(), status: jest.fn() } as unknown as Response;
  (res.status as jest.Mock).mockReturnValue(res);
  return res;
}
function makeNext(): NextFunction { return jest.fn(); }

function makeController() {
  const getShops = { execute: jest.fn().mockResolvedValue(mockList) } as unknown as GetShopsUseCase;
  const getDetail = { execute: jest.fn().mockResolvedValue(mockShop) } as unknown as GetShopDetailUseCase;
  return { ctrl: new CatalogController(getShops, getDetail), getShops, getDetail };
}

describe('CatalogController.list', () => {
  it('샵 목록을 반환한다', async () => {
    const { ctrl } = makeController();
    const res = makeRes();
    await ctrl.list(makeReq(), res, makeNext());
    expect(res.json).toHaveBeenCalledWith(mockList);
  });

  it('query 파라미터를 파싱해서 use case에 전달한다', async () => {
    const { ctrl, getShops } = makeController();
    await ctrl.list(
      makeReq({ query: { region: '강남', sort: 'price_asc', has_slot: 'true', page: '2', limit: '10' } }),
      makeRes(), makeNext(),
    );
    expect(getShops.execute).toHaveBeenCalledWith(expect.objectContaining({
      region: '강남', sort: 'price_asc', hasSlot: true, page: 2, limit: 10,
    }));
  });

  it('use case 에러를 next로 전달한다', async () => {
    const { ctrl, getShops } = makeController();
    (getShops.execute as jest.Mock).mockRejectedValue(new Error('db error'));
    const next = makeNext();
    await ctrl.list(makeReq(), makeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

describe('CatalogController.detail', () => {
  it('샵 상세를 반환한다', async () => {
    const { ctrl } = makeController();
    const res = makeRes();
    await ctrl.detail(makeReq({ params: { shopId: 's1' } }), res, makeNext());
    expect(res.json).toHaveBeenCalledWith(mockShop);
  });

  it('샵이 없으면 SHOP_NOT_FOUND 에러를 next로 전달한다', async () => {
    const { ctrl, getDetail } = makeController();
    (getDetail.execute as jest.Mock).mockRejectedValue(Errors.shopNotFound());
    const next = makeNext();
    await ctrl.detail(makeReq({ params: { shopId: 'x' } }), makeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: ErrorCode.SHOP_NOT_FOUND }));
  });
});
