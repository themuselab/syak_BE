// 실행: node scripts/provision-review-account.cjs <비공개 자격증명 파일 경로>
// 파일 형식: { "username": "syak.review", "password": "임의의 긴 비밀번호" }
// DATABASE_URL로 지정한 DB에만 적용. 비밀번호는 stdout/SQL 로그에 출력하지 않는다.
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const { hashReviewPassword } = require('../dist/contexts/auth/infrastructure/reviewPassword');

async function main() {
  const credentials = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  if (!/^[a-z0-9._-]{3,64}$/.test(credentials.username) ||
      typeof credentials.password !== 'string' || credentials.password.length < 20 || credentials.password.length > 128) {
    throw new Error('아이디 또는 비밀번호 형식이 올바르지 않습니다. 비밀번호는 20~128자여야 합니다.');
  }
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL이 필요합니다.');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(fs.readFileSync(path.join(__dirname, '../db/migration_review_login.sql'), 'utf8'));
    await client.query('SELECT pg_advisory_xact_lock(87351629)');
    const { rows } = await client.query('SELECT user_id FROM review_accounts WHERE username = $1', [credentials.username]);
    const userId = rows[0]?.user_id ?? (await client.query(
      "INSERT INTO users (nickname, profile_image) VALUES ('SYAK 심사', NULL) RETURNING id",
    )).rows[0].id;
    const hash = await hashReviewPassword(credentials.password);
    await client.query(`INSERT INTO review_accounts (username, user_id, password_hash) VALUES ($1, $2, $3)
      ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash, enabled = TRUE`,
    [credentials.username, userId, hash]);
    await client.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
    await client.query('COMMIT');
    console.log('전용 소비자 심사 계정을 준비했습니다. 비밀번호는 입력 파일에서 확인하세요.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); await pool.end(); }
}
main().catch(() => { console.error('계정 준비 실패: 연결 대상과 스키마를 확인하세요.'); process.exitCode = 1; });
