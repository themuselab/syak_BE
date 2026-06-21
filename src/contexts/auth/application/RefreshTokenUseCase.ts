import { IUserRepository } from '../ports/IUserRepository';
import { ITokenService } from '../ports/ITokenService';
import { AuthToken } from '../domain/AuthToken';
import { Errors } from '../../../shared/errors/AppError';

export class RefreshTokenUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly tokenService: ITokenService,
  ) {}

  async execute(refreshToken: string): Promise<AuthToken> {
    const record = await this.userRepo.findRefreshToken(refreshToken);
    if (!record) throw Errors.refreshInvalid();
    if (record.expiresAt < new Date()) {
      await this.userRepo.deleteRefreshToken(refreshToken);
      throw Errors.refreshInvalid();
    }

    const token = this.tokenService.issueTokens(record.userId);
    const newExpiry = this.tokenService.getRefreshExpiry();

    await this.userRepo.deleteRefreshToken(refreshToken);
    await this.userRepo.saveRefreshToken(record.userId, token.refreshToken, newExpiry);

    return token;
  }
}
