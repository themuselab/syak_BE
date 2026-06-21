import { Request, Response, NextFunction } from 'express';
import { FavoriteController } from '../interface/FavoriteController';
import { GetFavoritesUseCase } from '../application/GetFavoritesUseCase';
import { AddFavoriteUseCase } from '../application/AddFavoriteUseCase';
import { RemoveFavoriteUseCase } from '../application/RemoveFavoriteUseCase';
import { Favorite } from '../domain/Favorite';
import { ErrorCode } from '../../../shared/errors/ErrorCode';
import { Errors } from '../../../shared/errors/AppError';

const mockFav: Favorite = { id: 'f1', userId: 'u1', shopId: 's1', shopName: '테스트샵', shopRegion: '강남', createdAt: new Date() };

function makeReq(overrides: Partial<Request> = {}): Request {
  return { params: {}, user: { sub: 'u1', provider: 'kakao' }, ...overrides } as unknown as Request;
}
function makeRes() {
  const res = { json: jest.fn(), status: jest.fn(), send: jest.fn() } as unknown as Response;
  (res.status as jest.Mock).mockReturnValue(res);
  return res;
}
function makeNext(): NextFunction { return jest.fn(); }

function makeController() {
  const get = { execute: jest.fn().mockResolvedValue([mockFav]) } as unknown as GetFavoritesUseCase;
  const add = { execute: jest.fn().mockResolvedValue(mockFav) } as unknown as AddFavoriteUseCase;
  const remove = { execute: jest.fn().mockResolvedValue(undefined) } as unknown as RemoveFavoriteUseCase;
  return { ctrl: new FavoriteController(get, add, remove), get, add, remove };
}

describe('FavoriteController', () => {
  it('list — 즐겨찾기 목록을 반환한다', async () => {
    const { ctrl } = makeController();
    const res = makeRes();
    await ctrl.list(makeReq(), res, makeNext());
    expect(res.json).toHaveBeenCalledWith({ favorites: [mockFav] });
  });

  it('add — 즐겨찾기를 추가하고 201을 반환한다', async () => {
    const { ctrl } = makeController();
    const res = makeRes();
    await ctrl.add(makeReq({ params: { shopId: 's1' } }), res, makeNext());
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(mockFav);
  });

  it('add — 이미 즐겨찾기이면 409 에러를 next로 넘긴다', async () => {
    const { ctrl, add } = makeController();
    (add.execute as jest.Mock).mockRejectedValue(Errors.favoriteExists());
    const next = makeNext();
    await ctrl.add(makeReq({ params: { shopId: 's1' } }), makeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: ErrorCode.FAVORITE_ALREADY_EXISTS }));
  });

  it('remove — 즐겨찾기를 삭제하고 204를 반환한다', async () => {
    const { ctrl } = makeController();
    const res = makeRes();
    await ctrl.remove(makeReq({ params: { shopId: 's1' } }), res, makeNext());
    expect(res.status).toHaveBeenCalledWith(204);
  });
});
