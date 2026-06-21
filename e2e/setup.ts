import 'dotenv/config';
import { Pool } from 'pg';

export async function getTestPool(): Promise<Pool> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

export async function seedShop(pool: Pool, shopId = 'test-shop-1'): Promise<void> {
  await pool.query(
    `INSERT INTO shops (id, name, gu, category, categories, min_price, price_tier, today_open)
     VALUES ($1, '테스트샵', '강남구', '네일', '["네일"]'::jsonb, 20000, '2만원대', true)
     ON CONFLICT (id) DO NOTHING`,
    [shopId],
  );
}

export async function seedSlot(pool: Pool, shopId = 'test-shop-1'): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  await pool.query(
    `INSERT INTO slots (shop_id, date, start_time) VALUES ($1, $2, '14:00')
     ON CONFLICT (shop_id, date, start_time) DO NOTHING`,
    [shopId, today],
  );
}

export async function cleanupUser(pool: Pool, userId: string): Promise<void> {
  await pool.query('DELETE FROM users WHERE id = $1', [userId]);
}
