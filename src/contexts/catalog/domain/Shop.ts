export type PriceTier = '1만원대' | '2만원대' | '3만원대' | '4만원대+';
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
  bookingUrl: string | null;
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
