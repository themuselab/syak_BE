import { Request, Response, NextFunction } from 'express';
import { Errors } from '../errors/AppError';
import { verifyAdminSession } from '../../contexts/admin/interface/AdminGoogleAuth';

export function requireAdminAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.syak_admin as string | undefined;
  if (!token) return next(Errors.adminUnauthorized());
  if (!verifyAdminSession(token)) return next(Errors.adminUnauthorized());
  next();
}
