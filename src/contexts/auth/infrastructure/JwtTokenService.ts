import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { ITokenService } from '../ports/ITokenService';
import { AuthToken } from '../domain/AuthToken';

export class JwtTokenService implements ITokenService {
  private readonly secret: string;
  private readonly accessExpiresIn: string;
  private readonly refreshExpiresInMs: number;

  constructor() {
    this.secret = process.env.JWT_SECRET!;
    this.accessExpiresIn = process.env.JWT_ACCESS_EXPIRES_IN ?? '15m';
    this.refreshExpiresInMs = this.parseDuration(process.env.JWT_REFRESH_EXPIRES_IN ?? '1d');
  }

  issueTokens(userId: string): AuthToken {
    const accessToken = jwt.sign(
      { sub: userId },
      this.secret,
      { expiresIn: this.accessExpiresIn } as jwt.SignOptions,
    );
    const refreshToken = this.generateRefreshToken();
    return { accessToken, refreshToken, expiresIn: 900 }; // 15분 = 900초
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
