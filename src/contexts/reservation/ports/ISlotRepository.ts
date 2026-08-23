import { Slot, SlotSearchQuery, ShopWithSlots } from '../domain/Slot';

export interface ISlotRepository {
  findByShop(shopId: string, dates: string[]): Promise<Slot[]>;
  search(query: SlotSearchQuery): Promise<ShopWithSlots[]>;
  /** 스크래퍼 동기화: 날짜창의 scraper 슬롯 교체. 오늘 신규 슬롯 반환(알림용) */
  syncScraperWindow(
    startDate: string, endDate: string, shopIds: string[], slots: Slot[],
  ): Promise<{ inserted: number; newSlots: Slot[] }>;
  /** 지금(date, after 이후) 열려있는 샵 id — 초록핀(today_open) 재계산용 */
  openNowShopIds(date: string, after: string): Promise<string[]>;
}
