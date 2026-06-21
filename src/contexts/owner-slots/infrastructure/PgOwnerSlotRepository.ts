import { Pool } from 'pg';
import { IOwnerSlotRepository } from '../ports/IOwnerSlotRepository';
import { OwnerSlot, CreateSlotDto } from '../domain/OwnerSlot';

const COLS = `id, shop_id, date::text, to_char(start_time, 'HH24:MI') AS start_time, owner_id`;

const mapRow = (r: Record<string, unknown>): OwnerSlot => ({
  id:        r.id as number,
  shopId:    r.shop_id as string,
  date:      r.date as string,
  startTime: r.start_time as string,
  source:    'owner',
  ownerId:   r.owner_id as string,
});

export class PgOwnerSlotRepository implements IOwnerSlotRepository {
  constructor(private readonly pool: Pool) {}

  async findByShop(shopId: string): Promise<OwnerSlot[]> {
    const { rows } = await this.pool.query(
      `SELECT ${COLS} FROM slots WHERE shop_id = $1 AND source = 'owner' ORDER BY date, start_time`,
      [shopId],
    );
    return rows.map(mapRow);
  }

  async findById(id: number): Promise<OwnerSlot | null> {
    const { rows } = await this.pool.query(
      `SELECT ${COLS} FROM slots WHERE id = $1 AND source = 'owner'`,
      [id],
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async create(shopId: string, ownerId: string, dto: CreateSlotDto): Promise<OwnerSlot> {
    const { rows } = await this.pool.query(
      `INSERT INTO slots (shop_id, date, start_time, source, owner_id)
       VALUES ($1, $2, $3, 'owner', $4)
       RETURNING ${COLS}`,
      [shopId, dto.date, dto.startTime, ownerId],
    );
    return mapRow(rows[0]);
  }

  async update(id: number, dto: Partial<CreateSlotDto>): Promise<OwnerSlot> {
    const sets: string[] = [];
    const params: unknown[] = [id];
    if (dto.date)      { params.push(dto.date);      sets.push(`date       = $${params.length}`); }
    if (dto.startTime) { params.push(dto.startTime); sets.push(`start_time = $${params.length}`); }

    const { rows } = await this.pool.query(
      `UPDATE slots SET ${sets.join(', ')} WHERE id = $1 AND source = 'owner' RETURNING ${COLS}`,
      params,
    );
    return mapRow(rows[0]);
  }

  async delete(id: number): Promise<void> {
    await this.pool.query(`DELETE FROM slots WHERE id = $1 AND source = 'owner'`, [id]);
  }
}
