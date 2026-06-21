import { IOwnerRepository } from '../ports/IOwnerRepository';
import { IOwnerTokenService } from '../ports/IOwnerTokenService';
import { OwnerToken } from '../domain/Owner';
import { Errors } from '../../../shared/errors/AppError';

export class RefreshOwnerTokenUseCase {
  constructor(
    private readonly ownerRepo: IOwnerRepository,
    private readonly tokenService: IOwnerTokenService,
  ) {}

  async execute(refreshToken: string): Promise<OwnerToken> {
    const owner = await this.ownerRepo.findByRefreshToken(refreshToken);
    if (!owner) throw Errors.refreshInvalid();

    await this.ownerRepo.deleteRefreshToken(refreshToken);
    const token = this.tokenService.issueTokens(owner.id, owner.shopId);
    const expiry = this.tokenService.getRefreshExpiry();
    await this.ownerRepo.saveRefreshToken(owner.id, token.refreshToken, expiry);
    return token;
  }
}
