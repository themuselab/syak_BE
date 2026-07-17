import { Pool } from 'pg';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import ws from 'ws';
import { logger } from '../logger';

let rdsPool: Pool | null = null;
let sbClient: SupabaseClient | null = null;

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

/** Supabase REST API 클라이언트 — 샵/슬롯 읽기 + 어드민 샵 CRUD */
export function getSupabaseClient(): SupabaseClient {
  if (!sbClient) {
    sbClient = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { realtime: { transport: ws as any } },
    );
  }
  return sbClient;
}

export async function closePool(): Promise<void> {
  await Promise.all([
    rdsPool?.end(),
  ]);
}
