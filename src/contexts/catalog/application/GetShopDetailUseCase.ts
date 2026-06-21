import { IShopRepository } from '../ports/IShopRepository';
import { Shop } from '../domain/Shop';
import { Errors } from '../../../shared/errors/AppError';

export class GetShopDetailUseCase {
  constructor(private readonly shopRepo: IShopRepository) {}

  async execute(shopId: string): Promise<Shop> {
    const shop = await this.shopRepo.findById(shopId);
    if (!shop) throw Errors.shopNotFound({ shopId });
    return shop;
  }
}
