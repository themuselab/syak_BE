import { AppError, Errors } from '../AppError';
import { ErrorCode } from '../ErrorCode';

describe('AppError', () => {
  it('에러 코드와 한국어 메시지를 포함한다', () => {
    const err = Errors.shopNotFound();
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe(ErrorCode.SHOP_NOT_FOUND);
    expect(err.message).toBe('해당 샵을 찾을 수 없습니다');
    expect(err.statusCode).toBe(404);
  });

  it('details를 포함하면 toJSON에 details가 포함된다', () => {
    const err = Errors.validation({ field: '값이 필요합니다' });
    const json = err.toJSON();
    expect(json.details).toEqual({ field: '값이 필요합니다' });
  });

  it('details가 없으면 toJSON에 details 키가 없다', () => {
    const err = Errors.shopNotFound();
    const json = err.toJSON();
    expect(json).not.toHaveProperty('details');
  });

  it('instanceof AppError로 확인할 수 있다', () => {
    expect(Errors.unauthorized()).toBeInstanceOf(AppError);
    expect(Errors.internal()).toBeInstanceOf(AppError);
  });

  it('각 factory가 올바른 statusCode를 반환한다', () => {
    expect(Errors.unauthorized().statusCode).toBe(401);
    expect(Errors.forbidden().statusCode).toBe(403);
    expect(Errors.shopNotFound().statusCode).toBe(404);
    expect(Errors.favoriteExists().statusCode).toBe(409);
    expect(Errors.internal().statusCode).toBe(500);
  });
});
