import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/AppError';
import { ErrorCode } from '../errors/ErrorCode';
import { logger } from '../logger';

const reqCtx = (req: Request) => {
  const r = req as unknown as Record<string, Record<string, unknown> | undefined>;
  return {
    method: req.method,
    url:    req.url,
    ip:     req.ip,
    userId: r.user?.sub ?? r.owner?.sub ?? null,
  };
};

export function errorMiddleware(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error({ err, req: reqCtx(req), details: err.details }, err.message);
    } else if (err.statusCode >= 400) {
      logger.warn({ code: err.code, req: reqCtx(req), details: err.details }, err.message);
    }
    res.status(err.statusCode).json(err.toJSON());
    return;
  }

  logger.error({ err, req: reqCtx(req), stack: err.stack }, 'Unhandled error');
  res.status(500).json({
    code: ErrorCode.INTERNAL_ERROR,
    message: '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요',
  });
}
