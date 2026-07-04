import type { SupabaseClient } from '@supabase/supabase-js';
import { ISlotRepository } from '../ports/ISlotRepository';
import { Slot, SlotSearchQuery, ShopWithSlots } from '../domain/Slot';

export class PgSlotRepository implements ISlotRepository {
  constructor(private readonly sb: SupabaseClient) {}

  async findByShop(shopId: string, dates: string[]): Promise<Slot[]> {
    const { data, error } = await this.sb
      .from('slots')
      .select('shop_id, slot_date, start_time')
      .eq('shop_id', shopId)
      .in('slot_date', dates)
      .order('slot_date')
      .order('start_time');

    if (error) throw error;
    return (data ?? []).map(r => ({
      shopId:    r.shop_id as string,
      date:      r.slot_date as string,
      startTime: (r.start_time as string).slice(0, 5), // 'HH:MM:SS' → 'HH:MM'
    }));
  }

  async search(query: SlotSearchQuery): Promise<ShopWithSlots[]> {
    const timeSet = new Set(
      query.times.map(t => {
        const [h, m] = t.split(':');
        return `${h.padStart(2, '0')}:${(m ?? '00').padStart(2, '0')}`;
      }),
    );

    // slots에 shops FK가 없으므로 두 단계로 조회
    const { data: slotData, error: slotError } = await this.sb
      .from('slots')
      .select('shop_id, slot_date, start_time')
      .in('slot_date', query.dates);

    if (slotError) throw slotError;

    const filtered = (slotData ?? []).filter(
      row => timeSet.has((row.start_time as string).slice(0, 5)),
    );

    if (!filtered.length) return [];

    const shopIds = [...new Set(filtered.map(r => r.shop_id as string))];

    let shopQ = this.sb
      .from('shops')
      .select('id, name, gu')
      .in('id', shopIds);

    if (query.districts?.length) shopQ = shopQ.in('gu', query.districts);

    const { data: shopData, error: shopError } = await shopQ;
    if (shopError) throw shopError;

    const shopMap = new Map((shopData ?? []).map(s => [s.id as string, s]));

    const grouped = new Map<string, ShopWithSlots>();
    for (const row of filtered) {
      const sid = row.shop_id as string;
      const shop = shopMap.get(sid);
      if (!shop) continue; // district 필터로 제외된 샵
      if (!grouped.has(sid)) {
        grouped.set(sid, {
          shopId:         sid,
          shopName:       shop.name as string,
          district:       shop.gu as string,
          availableSlots: [],
        });
      }
      grouped.get(sid)!.availableSlots.push({
        date: row.slot_date as string,
        time: (row.start_time as string).slice(0, 5),
      });
    }
    return Array.from(grouped.values());
  }
}
