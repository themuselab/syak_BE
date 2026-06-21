import { IUserRepository } from '../ports/IUserRepository';

export class SignOutUseCase {
  constructor(private readonly userRepo: IUserRepository) {}

  async execute(userId: string): Promise<void> {
    await this.userRepo.deleteAllRefreshTokens(userId);
  }
}
