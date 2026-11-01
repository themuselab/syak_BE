import { IFavoriteRepository } from '../ports/IFavoriteRepository';
import { IShopRepository } from '../../catalog/ports/IShopRepository';
import { Favorite } from '../domain/Favorite';
import { Errors } from '../../../shared/errors/AppError';
import { recordFavoriteEvent } from './recordFavoriteEvent';

export class AddFavoriteUseCase {
  constructor(
    private readonly favoriteRepo: IFavoriteRepository,
    private readonly shopRepo: IShopRepository,
  ) {}

  async execute(userId: string, shopId: string): Promise<Favorite> {
    // 존재 확인과 샵 조회를 병렬 실행
    const [exists, shop] = await Promise.all([
      this.favoriteRepo.exists(userId, shopId),
      this.shopRepo.findById(shopId),
    ]);
    if (exists) throw Errors.favoriteExists({ shopId });
    if (!shop) throw Errors.shopNotFound({ shopId });
    const favorite = await this.favoriteRepo.add(userId, shopId, shop.name, shop.region);
    recordFavoriteEvent(this.favoriteRepo, userId, shopId, 'add');
    return favorite;
  }
}
