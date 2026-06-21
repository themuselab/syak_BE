import { Slot, SlotSearchQuery, ShopWithSlots } from '../domain/Slot';

export interface ISlotRepository {
  findByShop(shopId: string, dates: string[]): Promise<Slot[]>;
  search(query: SlotSearchQuery): Promise<ShopWithSlots[]>;
}
