export type PriceTier = '1만원대' | '2만원대' | '3만원대' | '4만원대+';
export type Category = 'nail' | 'hair' | 'waxing' | 'semipermanent';

export interface SlotSummaryItem {
  date: string;
  times: string[];
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
}

export type ShopSummary = Pick<
  Shop,
  | 'id' | 'name' | 'region' | 'district'
  | 'minPrice' | 'priceTier' | 'categories'
  | 'todayOpen' | 'slotSummary' | 'eventDesc' | 'eventPrice'
  | 'isPartner' | 'lat' | 'lng' | 'photos'
>;
