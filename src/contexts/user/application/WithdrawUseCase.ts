import { IUserProfileRepository } from '../ports/IUserProfileRepository';

export class WithdrawUseCase {
  constructor(private readonly userProfileRepo: IUserProfileRepository) {}

  async execute(userId: string): Promise<void> {
    await this.userProfileRepo.deleteById(userId);
  }
}
