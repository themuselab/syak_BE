import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { IOwnerTokenService } from '../ports/IOwnerTokenService';
import { OwnerToken } from '../domain/Owner';
import { Errors } from '../../../shared/errors/AppError';

interface OwnerJwtPayload {
  sub: string;
  role: 'owner';
  shopId: string | null;
}

export class OwnerJwtTokenService implements IOwnerTokenService {
  private readonly secret: string;
  private readonly accessExpiresIn: string;
  private readonly refreshExpiresInMs: number;

  constructor() {
    this.secret = process.env.JWT_SECRET!;
    this.accessExpiresIn = process.env.JWT_ACCESS_EXPIRES_IN ?? '15m';
    this.refreshExpiresInMs = this.parseDuration(process.env.JWT_REFRESH_EXPIRES_IN ?? '1d');
  }

  issueTokens(ownerId: string, shopId: string | null): OwnerToken {
    const payload: OwnerJwtPayload = { sub: ownerId, role: 'owner', shopId };
    const accessToken = jwt.sign(payload, this.secret, {
      expiresIn: this.accessExpiresIn,
    } as jwt.SignOptions);
    return { accessToken, refreshToken: this.generateRefreshToken(), expiresIn: 900 };
  }

  verifyAccessToken(token: string): { sub: string; shopId: string | null } {
    try {
      const payload = jwt.verify(token, this.secret) as OwnerJwtPayload;
      if (payload.role !== 'owner') throw Errors.ownerUnauthorized();
      return { sub: payload.sub, shopId: payload.shopId };
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) throw Errors.tokenExpired();
      throw Errors.ownerUnauthorized();
    }
  }

  generateRefreshToken(): string {
    return crypto.randomBytes(64).toString('hex');
  }

  getRefreshExpiry(): Date {
    return new Date(Date.now() + this.refreshExpiresInMs);
  }

  private parseDuration(str: string): number {
    const unit = str.slice(-1);
    const value = parseInt(str.slice(0, -1), 10);
    const ms: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
    return value * (ms[unit] ?? 1000);
  }
}
