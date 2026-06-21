import { Pool } from 'pg';
import { IFavoriteRepository } from '../ports/IFavoriteRepository';
import { Favorite } from '../domain/Favorite';

export class PgFavoriteRepository implements IFavoriteRepository {
  constructor(private readonly pool: Pool) {}

  async findByUser(userId: string): Promise<Favorite[]> {
    // shop_name / shop_region은 즐겨찾기 추가 시 비정규화 저장 (Supabase JOIN 불필요)
    const { rows } = await this.pool.query(
      `SELECT id, user_id, shop_id, shop_name, shop_region, created_at
       FROM favorites
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId],
    );
    return rows.map(this.map);
  }

  async exists(userId: string, shopId: string): Promise<boolean> {
    const { rows } = await this.pool.query(
      'SELECT 1 FROM favorites WHERE user_id = $1 AND shop_id = $2',
      [userId, shopId],
    );
    return rows.length > 0;
  }

  async add(userId: string, shopId: string, shopName: string, shopRegion: string | null): Promise<Favorite> {
    const { rows } = await this.pool.query(
      `INSERT INTO favorites (user_id, shop_id, shop_name, shop_region)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, shop_id) DO NOTHING
       RETURNING id, user_id, shop_id, shop_name, shop_region, created_at`,
      [userId, shopId, shopName, shopRegion],
    );
    return this.map(rows[0]);
  }

  async remove(userId: string, shopId: string): Promise<void> {
    await this.pool.query(
      'DELETE FROM favorites WHERE user_id = $1 AND shop_id = $2',
      [userId, shopId],
    );
  }

  private map(row: Record<string, unknown>): Favorite {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      shopId: row.shop_id as string,
      shopName: row.shop_name as string,
      shopRegion: row.shop_region as string | null,
      createdAt: row.created_at as Date,
    };
  }
}
