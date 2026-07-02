import { Category, PriceTier } from './Shop';

export type SortOrder = 'default' | 'price_asc' | 'price_desc' | 'partner';

export interface ShopFilter {
  q?: string;
  region?: string;
  sort?: SortOrder;
  categories?: Category[];
  districts?: string[];
  priceTiers?: PriceTier[];
  hasEvent?: boolean;
  hasSlot?: boolean;
  slotDate?: string;   // YYYY-MM-DD — 해당 날짜 슬롯 있는 샵만
  slotTime?: string;   // HH:MM — 해당 시간대 슬롯 있는 샵만 (slotDate와 함께 사용)
  page?: number;
  limit?: number;
}
