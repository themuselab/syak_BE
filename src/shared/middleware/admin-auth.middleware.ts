import { Request, Response, NextFunction } from 'express';
import { Errors } from '../errors/AppError';

export function requireAdminAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.syak_admin as string | undefined;
  if (!token) return next(Errors.adminUnauthorized());
  // 환경변수로 발급한 세션 토큰과 비교
  if (token !== process.env.ADMIN_SESSION_TOKEN) return next(Errors.adminUnauthorized());
  next();
}
