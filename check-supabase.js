require('dotenv/config');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.SUPABASE_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  // 테이블 목록
  const tables = await pool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
  );
  console.log('=== public 테이블 목록 ===');
  tables.rows.forEach(t => console.log(' ', t.table_name));

  // shops 컬럼 확인
  const cols = await pool.query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'shops' ORDER BY ordinal_position"
  );
  if (cols.rows.length === 0) {
    console.log('\nshops 테이블 없음');
  } else {
    console.log('\n=== shops 컬럼 ===');
    cols.rows.forEach(c => console.log(' ', c.column_name, ':', c.data_type));

    const count = await pool.query('SELECT COUNT(*) FROM shops');
    console.log('\nshops 총', count.rows[0].count, '건');
  }

  // slots 컬럼 확인
  const slotCols = await pool.query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'slots' ORDER BY ordinal_position"
  );
  if (slotCols.rows.length === 0) {
    console.log('\nslots 테이블 없음');
  } else {
    console.log('\n=== slots 컬럼 ===');
    slotCols.rows.forEach(c => console.log(' ', c.column_name, ':', c.data_type));
  }
}

main().catch(e => console.error('연결 실패:', e.message)).finally(() => pool.end());
