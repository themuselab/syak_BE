import { IUserProfileRepository } from '../ports/IUserProfileRepository';
import { UserProfile } from '../domain/UserProfile';
import { Errors } from '../../../shared/errors/AppError';

export class GetProfileUseCase {
  constructor(private readonly userProfileRepo: IUserProfileRepository) {}

  async execute(userId: string): Promise<UserProfile> {
    const profile = await this.userProfileRepo.findById(userId);
    if (!profile) throw Errors.unauthorized();
    return profile;
  }
}
