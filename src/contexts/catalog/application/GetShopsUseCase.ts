import { IShopRepository, ShopListResult } from '../ports/IShopRepository';
import { ShopFilter } from '../domain/ShopFilter';

export class GetShopsUseCase {
  constructor(private readonly shopRepo: IShopRepository) {}

  async execute(filter: ShopFilter): Promise<ShopListResult> {
    return this.shopRepo.findMany({
      ...filter,
      page: filter.page ?? 1,
      limit: Math.min(filter.limit ?? 20, 100),
    });
  }
}
