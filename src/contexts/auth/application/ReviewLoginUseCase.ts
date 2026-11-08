import { IReviewAccountRepository } from '../ports/IReviewAccountRepository';
import { IUserRepository } from '../ports/IUserRepository';
import { ITokenService } from '../ports/ITokenService';
import { Errors, AppError } from '../../../shared/errors/AppError';
import { ErrorCode } from '../../../shared/errors/ErrorCode';
import { SocialLoginResult } from './SocialLoginUseCase';

export class ReviewLoginUseCase {
  constructor(
    private readonly accounts: IReviewAccountRepository,
    private readonly users: IUserRepository,
    private readonly tokens: ITokenService,
    private readonly verifyPassword: (password: string, hash?: string) => Promise<boolean>,
  ) {}

  async execute(username: string, password: string, clientKey: string): Promise<SocialLoginResult> {
    if (!await this.accounts.consumeAttempt(clientKey)) {
      throw new AppError(429, ErrorCode.AUTH_UNAUTHORIZED);
    }
    const account = await this.accounts.findAccount(username);
    const correct = await this.verifyPassword(password, account?.passwordHash);
    if (!correct || !account?.enabled || account.user.status !== 'active') throw Errors.unauthorized();
    const { user } = account;
    const token = this.tokens.issueTokens(user.id);
    await this.users.saveRefreshToken(user.id, token.refreshToken, this.tokens.getRefreshExpiry());
    return { user: { id: user.id, nickname: user.nickname, profileImage: user.profileImage }, token, isNewUser: false };
  }
}
