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

    let q = this.sb
      .from('slots')
      .select('shop_id, slot_date, start_time, shops!inner(name, gu)')
      .in('slot_date', query.dates);

    if (query.districts?.length) q = q.in('shops.gu', query.districts);

    const { data, error } = await q;
    if (error) throw error;

    const filtered = (data ?? []).filter(
      row => timeSet.has((row.start_time as string).slice(0, 5)),
    );

    const grouped = new Map<string, ShopWithSlots>();
    for (const row of filtered) {
      const shop = (row as Record<string, unknown>).shops as { name: string; gu: string } | null;
      if (!grouped.has(row.shop_id as string)) {
        grouped.set(row.shop_id as string, {
          shopId:         row.shop_id as string,
          shopName:       shop?.name ?? '',
          district:       shop?.gu ?? '',
          availableSlots: [],
        });
      }
      grouped.get(row.shop_id as string)!.availableSlots.push({
        date: row.slot_date as string,
        time: (row.start_time as string).slice(0, 5),
      });
    }
    return Array.from(grouped.values());
  }
}
