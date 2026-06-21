import { Pool } from 'pg';
import { ISlotRepository } from '../ports/ISlotRepository';
import { Slot, SlotSearchQuery, ShopWithSlots } from '../domain/Slot';

export class PgSlotRepository implements ISlotRepository {
  constructor(private readonly pool: Pool) {}

  async findByShop(shopId: string, dates: string[]): Promise<Slot[]> {
    const { rows } = await this.pool.query(
      `SELECT shop_id, date::text, to_char(start_time, 'HH24:MI') AS start_time
       FROM slots
       WHERE shop_id = $1 AND date = ANY($2::date[])
       ORDER BY date, start_time`,
      [shopId, dates],
    );
    return rows.map((r) => ({ shopId: r.shop_id, date: r.date, startTime: r.start_time }));
  }

  async search(query: SlotSearchQuery): Promise<ShopWithSlots[]> {
    const timeConditions = query.times.map((t) => {
      const [h, m] = t.split(':');
      return `${h.padStart(2, '0')}:${(m ?? '00').padStart(2, '0')}`;
    });

    const params: unknown[] = [query.dates, timeConditions];
    let districtClause = '';
    if (query.districts?.length) {
      params.push(query.districts);
      districtClause = `AND s.gu = ANY($${params.length})`;
    }

    const { rows } = await this.pool.query(
      `SELECT sl.shop_id,
              s.name AS shop_name,
              s.gu   AS district,
              sl.date::text,
              to_char(sl.start_time, 'HH24:MI') AS start_time
       FROM slots sl
       JOIN shops s ON s.id = sl.shop_id
       WHERE sl.date = ANY($1::date[])
         AND to_char(sl.start_time, 'HH24:MI') = ANY($2)
         ${districtClause}
       ORDER BY sl.date, sl.start_time`,
      params,
    );

    const grouped = new Map<string, ShopWithSlots>();
    for (const row of rows) {
      if (!grouped.has(row.shop_id)) {
        grouped.set(row.shop_id, {
          shopId:         row.shop_id,
          shopName:       row.shop_name,
          district:       row.district,
          availableSlots: [],
        });
      }
      grouped.get(row.shop_id)!.availableSlots.push({ date: row.date, time: row.start_time });
    }
    return Array.from(grouped.values());
  }
}
