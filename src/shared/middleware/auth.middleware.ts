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
