import { Category, PriceTier } from './Shop';

// 'default' = 관련도순(앱 필터 시트 라벨). 'review' = 리뷰 많은순.
export type SortOrder = 'default' | 'price_asc' | 'price_desc' | 'partner' | 'review';

export interface ShopFilter {
  q?: string;
  region?: string;
  sort?: SortOrder;
  categories?: Category[];
  districts?: string[];
  priceTiers?: PriceTier[];
  priceMin?: number;          // 가격 범위(원) — 앱 필터 시트의 슬라이더. min_price 기준
  priceMax?: number;
  isPartner?: boolean;        // 샥 파트너 샵만 (앱 홈 "샥 파트너" 카테고리 칩)
  hasEvent?: boolean;
  hasSlot?: boolean;          // 오늘 슬롯 있는 샵만 (today_open=true)
  availableWithinDays?: number; // N일 내 슬롯 있는 샵만 (slots 테이블 조회)
  slotDate?: string;          // YYYY-MM-DD — 해당 날짜 슬롯 있는 샵만
  slotTime?: string;          // HH:MM — 해당 시간대 슬롯 있는 샵만 (slotDate와 함께)
  lat?: number;               // 위치 기반 — 중심 위도(거리순 정렬 기준)
  lng?: number;               // 위치 기반 — 중심 경도(거리순 정렬 기준)
  radius?: number;            // 반경 km (기본값 5) — bounds 없을 때만 사용
  // 지도 화면영역(bounds). 있으면 반경 대신 이 박스로 필터(웹/앱 지도뷰: 보이는 영역 = 목록·핀 일치).
  swLat?: number;
  swLng?: number;
  neLat?: number;
  neLng?: number;
  page?: number;
  limit?: number;
}
