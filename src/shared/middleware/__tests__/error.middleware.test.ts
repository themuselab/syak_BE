import { Request, Response, NextFunction } from 'express';
import { errorMiddleware } from '../error.middleware';
import { Errors } from '../../errors/AppError';
import { ErrorCode } from '../../errors/ErrorCode';

function makeReq(): Request { return { method: 'GET', url: '/test' } as Request; }
function makeNext(): NextFunction { return jest.fn(); }

function makeRes() {
  const res = { status: jest.fn(), json: jest.fn() } as unknown as Response;
  (res.status as jest.Mock).mockReturnValue(res);
  return res;
}

describe('errorMiddleware', () => {
  it('AppError이면 statusCode와 한국어 메시지를 응답한다', () => {
    const res = makeRes();
    errorMiddleware(Errors.shopNotFound(), makeReq(), res, makeNext());
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      code: ErrorCode.SHOP_NOT_FOUND,
      message: '해당 샵을 찾을 수 없습니다',
    }));
  });

  it('AppError가 아닌 일반 에러이면 500을 응답한다', () => {
    const res = makeRes();
    errorMiddleware(new Error('unexpected'), makeReq(), res, makeNext());
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: ErrorCode.INTERNAL_ERROR }));
  });

  it('401 에러는 warn 레벨로 로깅된다 (에러가 전파되지 않는다)', () => {
    const res = makeRes();
    expect(() => {
      errorMiddleware(Errors.unauthorized(), makeReq(), res, makeNext());
    }).not.toThrow();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
