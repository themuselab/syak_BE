import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Errors } from '../errors/AppError';

export interface JwtPayload {
  sub: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.syak_access as string | undefined;
  if (!token) return next(Errors.unauthorized());

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
    req.user = payload;
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) return next(Errors.tokenExpired());
    next(Errors.invalidToken());
  }
}

export function requireInternalKey(req: Request, _res: Response, next: NextFunction): void {
  const key = req.headers['x-internal-key'];
  if (key !== process.env.INTERNAL_API_KEY) {
    return next(Errors.internalKeyInvalid());
  }
  next();
}

/**
 * 선택 인증 — 공개 라우트에서 로그인 사용자를 식별만 한다(추적용).
 * access 쿠키가 있고 유효하면 req.user 를 채우고, 없거나 만료/무효여도 절대 거절하지 않는다.
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.syak_access as string | undefined;
  if (token && process.env.JWT_SECRET) {
    try {
      req.user = jwt.verify(token, process.env.JWT_SECRET) as JwtPayload;
    } catch {
      // 만료·무효 토큰은 비로그인으로 취급
    }
  }
  next();
}
