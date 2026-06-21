export interface AuthToken {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
}
