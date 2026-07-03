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
  hasSlot?: boolean;          // 오늘 슬롯 있는 샵만 (today_open=true)
  availableWithinDays?: number; // N일 내 슬롯 있는 샵만 (slots 테이블 조회)
  slotDate?: string;          // YYYY-MM-DD — 해당 날짜 슬롯 있는 샵만
  slotTime?: string;          // HH:MM — 해당 시간대 슬롯 있는 샵만 (slotDate와 함께)
  lat?: number;               // 위치 기반 필터 — 중심 위도
  lng?: number;               // 위치 기반 필터 — 중심 경도
  radius?: number;            // 위치 기반 필터 — 반경 km (기본값: 5)
  page?: number;
  limit?: number;
}
