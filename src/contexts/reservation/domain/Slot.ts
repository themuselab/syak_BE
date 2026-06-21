export interface Slot {
  shopId: string;
  date: string;
  startTime: string;
}

export interface SlotSearchQuery {
  dates: string[];
  times: string[];
  districts?: string[];  // 구 필터 (shops.gu)
}

export interface ShopWithSlots {
  shopId: string;
  shopName: string;
  district: string | null;  // shops.gu
  availableSlots: { date: string; time: string }[];
}
