import { IOwnerRepository } from '../ports/IOwnerRepository';
import { IPartnerCodeRepository } from '../ports/IPartnerCodeRepository';
import { IOwnerTokenService } from '../ports/IOwnerTokenService';
import { OwnerToken } from '../domain/Owner';
import { Errors } from '../../../shared/errors/AppError';

export class LinkShopByCodeUseCase {
  constructor(
    private readonly ownerRepo: IOwnerRepository,
    private readonly codeRepo: IPartnerCodeRepository,
    private readonly tokenService: IOwnerTokenService,
  ) {}

  async execute(ownerId: string, code: string): Promise<{ token: OwnerToken; shopId: string }> {
    const owner = await this.ownerRepo.findById(ownerId);
    if (!owner) throw Errors.ownerNotFound();
    if (owner.shopId) throw Errors.shopAlreadyLinked();

    const upperCode = code.toUpperCase();
    const partnerCode = await this.codeRepo.findByCode(upperCode);
    if (!partnerCode) throw Errors.partnerCodeInvalid();
    if (partnerCode.used) throw Errors.partnerCodeUsed();
    if (partnerCode.expiresAt < new Date()) throw Errors.partnerCodeExpired();

    await this.ownerRepo.linkShop(ownerId, partnerCode.shopId);
    await this.codeRepo.markUsed(upperCode, ownerId);

    // shopId 포함 토큰 재발급
    await this.ownerRepo.deleteAllRefreshTokens(ownerId);
    const token = this.tokenService.issueTokens(ownerId, partnerCode.shopId);
    const refreshExpiry = this.tokenService.getRefreshExpiry();
    await this.ownerRepo.saveRefreshToken(ownerId, token.refreshToken, refreshExpiry);

    return { token, shopId: partnerCode.shopId };
  }
}
