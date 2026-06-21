import { Pool } from 'pg';
import { logger } from '../logger';

let rdsPool: Pool | null = null;
let supabasePool: Pool | null = null;

function makePool(url: string, name: string): Pool {
  const pool = new Pool({
    connectionString: url,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30000,
  });
  pool.on('error', (err) => logger.error({ err, pool: name }, 'Unexpected DB pool error'));
  return pool;
}

/** AWS RDS — 사용자 데이터 (users, favorites, notifications, ...) */
export function getRdsPool(): Pool {
  if (!rdsPool) rdsPool = makePool(process.env.DATABASE_URL!, 'rds');
  return rdsPool;
}

/** Supabase — 샵/슬롯 읽기 전용 + SlotListener LISTEN/NOTIFY */
export function getSupabasePool(): Pool {
  if (!supabasePool) supabasePool = makePool(process.env.SUPABASE_DATABASE_URL!, 'supabase');
  return supabasePool;
}

export async function closePool(): Promise<void> {
  await Promise.all([
    rdsPool?.end(),
    supabasePool?.end(),
  ]);
}
