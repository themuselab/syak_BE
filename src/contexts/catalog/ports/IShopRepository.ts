import { Shop, ShopSummary } from '../domain/Shop';
import { ShopFilter } from '../domain/ShopFilter';

export interface ShopListResult {
  items: ShopSummary[];
  total: number;
  page: number;
  limit: number;
}

export interface IShopRepository {
  findMany(filter: ShopFilter): Promise<ShopListResult>;
  findById(id: string): Promise<Shop | null>;
}
