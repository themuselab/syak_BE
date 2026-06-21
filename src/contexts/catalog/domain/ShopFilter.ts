import { Category, PriceTier } from './Shop';

export type SortOrder = 'default' | 'price_asc' | 'partner';

export interface ShopFilter {
  region?: string;
  sort?: SortOrder;
  categories?: Category[];
  districts?: string[];
  priceTiers?: PriceTier[];
  hasEvent?: boolean;
  hasSlot?: boolean;
  page?: number;
  limit?: number;
}
