import { IFavoriteRepository } from '../ports/IFavoriteRepository';
import { Errors } from '../../../shared/errors/AppError';

export class RemoveFavoriteUseCase {
  constructor(private readonly favoriteRepo: IFavoriteRepository) {}

  async execute(userId: string, shopId: string): Promise<void> {
    const exists = await this.favoriteRepo.exists(userId, shopId);
    if (!exists) throw Errors.favoriteNotFound({ shopId });
    await this.favoriteRepo.remove(userId, shopId);
  }
}
