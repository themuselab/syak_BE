import { OwnerToken } from '../domain/Owner';

export interface IOwnerTokenService {
  issueTokens(ownerId: string, shopId: string | null): OwnerToken;
  verifyAccessToken(token: string): { sub: string; shopId: string | null };
  generateRefreshToken(): string;
  getRefreshExpiry(): Date;
}
