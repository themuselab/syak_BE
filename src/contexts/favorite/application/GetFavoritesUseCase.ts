import { IFavoriteRepository } from '../ports/IFavoriteRepository';
import { Favorite } from '../domain/Favorite';

export class GetFavoritesUseCase {
  constructor(private readonly favoriteRepo: IFavoriteRepository) {}

  async execute(userId: string): Promise<Favorite[]> {
    return this.favoriteRepo.findByUser(userId);
  }
}
