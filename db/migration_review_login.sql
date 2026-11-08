-- RDS. 전용 소비자 계정만 연결하며 소셜 계정이나 관리자 권한을 부여하지 않는다.
CREATE TABLE IF NOT EXISTS review_accounts (
  username TEXT PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS review_login_attempts (
  client_key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
