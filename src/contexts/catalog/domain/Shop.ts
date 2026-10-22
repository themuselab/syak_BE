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
  /** 방문일 표시 문자열(네이버 원문, 예 "10.8.목"). 옛 수집분은 없음 → null */
  visited: string | null;
}

/** 요일별 영업시간 1줄(네이버 newBusinessHours 정규화). start/end 없으면 휴무 */
export interface BusinessHourDay {
  day: string;            // "월"…"일", 또는 "매일"
  start: string | null;   // "10:00"
  end: string | null;     // "21:00" (24:00 넘김은 네이버 표기 그대로)
  breaks: { start: string; end: string }[];
  description: string | null; // "정기휴무" 등
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
  /** 한 줄 소개(detail.introduction). 스크래퍼가 채우기 전까지는 null */
  introduction: string | null;
  /** 리뷰 1건 미리보기(detail.reviews[0].body). 목록 카드 하단 한 줄용 */
  previewReview: string | null;
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
  /** 방문자 리뷰 평점(네이버 visitorReviewsScore). 수집 전/비공개면 null */
  rating: number | null;
  /** 요일별 영업시간. 수집 전이면 null — 앱은 null이면 영업 정보 줄을 숨긴다 */
  businessHours: BusinessHourDay[] | null;
}

export type ShopSummary = Pick<
  Shop,
  | 'id' | 'name' | 'region' | 'district'
  | 'minPrice' | 'priceTier' | 'categories'
  | 'todayOpen' | 'slotSummary' | 'eventDesc' | 'eventPrice'
  | 'isPartner' | 'lat' | 'lng' | 'photos' | 'reviewCount' | 'introduction'
  | 'previewReview' | 'roadAddress'
>;
