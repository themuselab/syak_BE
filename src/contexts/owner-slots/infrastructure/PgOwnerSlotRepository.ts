import { Pool } from 'pg';
import { IOwnerSlotRepository } from '../ports/IOwnerSlotRepository';
import { OwnerSlot, CreateSlotDto, UpdateSlotDto } from '../domain/OwnerSlot';

// 과거(종료<지금, KST) 미예약 슬롯은 조회 시점에 'expired'로 표시(영속화는 대시보드 reconcile에서)
const STATUS_EXPR = `
  CASE WHEN status IN ('waiting','notified')
        AND (date + COALESCE(end_time, start_time)) AT TIME ZONE 'Asia/Seoul' < now()
       THEN 'expired' ELSE status END`;

const COLS = `
  id, shop_id, date::text,
  to_char(start_time, 'HH24:MI') AS start_time,
  to_char(end_time,   'HH24:MI') AS end_time,
  COALESCE(service_items, '{}') AS service_items,
  ${STATUS_EXPR} AS status,
  recipient_count, reserved_amount, reserved_customer,
  owner_id, created_at`;

const mapRow = (r: Record<string, unknown>): OwnerSlot => ({
  id:               Number(r.id),
  shopId:           r.shop_id as string,
  date:             r.date as string,
  startTime:        r.start_time as string,
  endTime:          (r.end_time as string) ?? null,
  serviceItems:     (r.service_items as string[]) ?? [],
  status:           r.status as OwnerSlot['status'],
  recipientCount:   Number(r.recipient_count ?? 0),
  reservedAmount:   r.reserved_amount == null ? null : Number(r.reserved_amount),
  reservedCustomer: (r.reserved_customer as string) ?? null,
  source:           'owner',
  ownerId:          r.owner_id as string,
  createdAt:        (r.created_at instanceof Date ? r.created_at.toISOString() : (r.created_at as string)),
});

export class PgOwnerSlotRepository implements IOwnerSlotRepository {
  constructor(private readonly pool: Pool) {}

  async findByShop(shopId: string): Promise<OwnerSlot[]> {
    const { rows } = await this.pool.query(
      `SELECT ${COLS} FROM slots WHERE shop_id = $1 AND source = 'owner' ORDER BY date DESC, start_time DESC`,
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
      `INSERT INTO slots (shop_id, date, start_time, end_time, service_items, source, owner_id, status)
       VALUES ($1, $2, $3, $4, $5, 'owner', $6, 'waiting')
       RETURNING ${COLS}`,
      [shopId, dto.date, dto.startTime, dto.endTime ?? null, dto.serviceItems ?? [], ownerId],
    );
    return mapRow(rows[0]);
  }

  async update(id: number, dto: UpdateSlotDto): Promise<OwnerSlot> {
    const sets: string[] = [];
    const params: unknown[] = [id];
    if (dto.date)              { params.push(dto.date);            sets.push(`date          = $${params.length}`); }
    if (dto.startTime)         { params.push(dto.startTime);       sets.push(`start_time    = $${params.length}`); }
    if (dto.endTime !== undefined)     { params.push(dto.endTime);      sets.push(`end_time      = $${params.length}`); }
    if (dto.serviceItems !== undefined){ params.push(dto.serviceItems); sets.push(`service_items = $${params.length}`); }

    const { rows } = await this.pool.query(
      `UPDATE slots SET ${sets.join(', ')} WHERE id = $1 AND source = 'owner' RETURNING ${COLS}`,
      params,
    );
    return mapRow(rows[0]);
  }

  async delete(id: number): Promise<void> {
    await this.pool.query(`DELETE FROM slots WHERE id = $1 AND source = 'owner'`, [id]);
  }

  async markNotified(id: number, recipientCount: number): Promise<OwnerSlot> {
    const { rows } = await this.pool.query(
      `UPDATE slots SET status = 'notified', recipient_count = $2
       WHERE id = $1 AND source = 'owner' RETURNING ${COLS}`,
      [id, recipientCount],
    );
    return mapRow(rows[0]);
  }

  async reserve(id: number, amount: number | null, customer: string | null): Promise<OwnerSlot> {
    const { rows } = await this.pool.query(
      `UPDATE slots SET status = 'reserved', reserved_amount = $2, reserved_customer = $3, reserved_at = now()
       WHERE id = $1 AND source = 'owner' RETURNING ${COLS}`,
      [id, amount, customer],
    );
    return mapRow(rows[0]);
  }
}
