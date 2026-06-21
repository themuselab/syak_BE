import { Pool } from 'pg';
import { IPartnerCodeRepository, PartnerCode } from '../ports/IPartnerCodeRepository';

export class PgPartnerCodeRepository implements IPartnerCodeRepository {
  constructor(private readonly pool: Pool) {}

  async findByCode(code: string): Promise<PartnerCode | null> {
    const { rows } = await this.pool.query(
      'SELECT code, shop_id, used, used_by, expires_at FROM partner_codes WHERE code = $1',
      [code],
    );
    if (!rows[0]) return null;
    return {
      code:      rows[0].code,
      shopId:    rows[0].shop_id,
      used:      rows[0].used,
      usedBy:    rows[0].used_by ?? null,
      expiresAt: rows[0].expires_at,
    };
  }

  async markUsed(code: string, ownerId: string): Promise<void> {
    await this.pool.query(
      'UPDATE partner_codes SET used = TRUE, used_by = $2, used_at = now() WHERE code = $1',
      [code, ownerId],
    );
  }

  async create(code: string, shopId: string, expiresAt: Date): Promise<void> {
    await this.pool.query(
      'INSERT INTO partner_codes (code, shop_id, expires_at) VALUES ($1, $2, $3)',
      [code, shopId, expiresAt],
    );
  }
}
