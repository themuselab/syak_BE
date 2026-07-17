export type PriceTier = '1만원대' | '2만원대' | '3만원대' | '4만원이상';
export type Category =
  | '네일' | '헤어' | '왁싱' | '반영구'
  | '속눈썹' | '마사지' | '피부' | '태닝';

export interface SlotSummaryItem {
  name: string;
  times: string[];
}

export interface ShopMenu {
  name: string;
  price: number | null;
  recommend: boolean;
}

export interface ShopReview {
  body: string;
  images: string[];
  keywords: string[];
  ownerReply: string | null;
}

/** 예약/문의 수단. type으로 정확히 구분된다 (스크래퍼가 분류해 저장) */
export type ReservationRouteType = 'naver' | 'kakao' | 'talktalk' | 'instagram' | 'phone';
export interface ReservationRoute {
  type: ReservationRouteType;
  label: string;   // 예: "네이버 예약", "인스타로 문의"
  value: string;   // URL 또는 전화번호
}

export interface Shop {
  id: string;
  name: string;
  region: string | null;
  district: string | null;
  minPrice: number | null;
  priceTier: PriceTier | null;
  categories: Category[];
  todayOpen: boolean;
  slotSummary: SlotSummaryItem[];
  eventDesc: string | null;
  eventPrice: string | null;
  bizId: string | null;
  isPartner: boolean;
  lat: number | null;
  lng: number | null;
  photos: string[];
  reviewCount: number;
  /** 예약/문의 수단 전체. FE는 type으로 버튼/라벨을 정확히 렌더링한다 */
  reservationRoutes: ReservationRoute[];
  /** 대표 예약 링크 = naver 예약 우선, 없으면 첫 항목 (하위호환) */
  bookingUrl: string | null;
  /** bookingUrl의 수단 종류 (FE가 URL을 추측하지 않도록) */
  bookingType: ReservationRouteType | null;
  phone: string | null;
  roadAddress: string | null;
  menus: ShopMenu[];
  reviews: ShopReview[];
}

export type ShopSummary = Pick<
  Shop,
  | 'id' | 'name' | 'region' | 'district'
  | 'minPrice' | 'priceTier' | 'categories'
  | 'todayOpen' | 'slotSummary' | 'eventDesc' | 'eventPrice'
  | 'isPartner' | 'lat' | 'lng' | 'photos' | 'reviewCount'
>;
