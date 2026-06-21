import { IOwnerRepository } from '../ports/IOwnerRepository';

export class SignOutOwnerUseCase {
  constructor(private readonly ownerRepo: IOwnerRepository) {}

  async execute(ownerId: string): Promise<void> {
    await this.ownerRepo.deleteAllRefreshTokens(ownerId);
  }
}
