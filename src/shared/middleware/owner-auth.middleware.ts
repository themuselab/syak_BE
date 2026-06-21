import { Request, Response, NextFunction } from 'express';
import { OwnerJwtTokenService } from '../../contexts/owner/infrastructure/OwnerJwtTokenService';
import { Errors } from '../errors/AppError';

export interface OwnerPayload {
  sub: string;
  shopId: string | null;
}

declare global {
  namespace Express {
    interface Request {
      owner?: OwnerPayload;
    }
  }
}

const tokenService = new OwnerJwtTokenService();

export function requireOwnerAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.syak_owner_access as string | undefined;
  if (!token) return next(Errors.ownerUnauthorized());
  try {
    req.owner = tokenService.verifyAccessToken(token);
    next();
  } catch (err) {
    next(err);
  }
}

export function requireLinkedShop(req: Request, _res: Response, next: NextFunction): void {
  if (!req.owner?.shopId) {
    return next(Errors.validation({ shopId: '샵 연결이 필요합니다. 인증코드를 먼저 입력해 주세요' }));
  }
  next();
}
