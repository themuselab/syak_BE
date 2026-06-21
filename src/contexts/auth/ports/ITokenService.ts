import { AuthToken } from '../domain/AuthToken';

export interface ITokenService {
  issueTokens(userId: string): AuthToken;
  generateRefreshToken(): string;
  getRefreshExpiry(): Date;
}
