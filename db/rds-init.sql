-- ============================================================
-- AWS RDS Schema — 앱 전용 사용자 데이터
-- shops / slots 는 Supabase 전용 (스크래퍼 소유)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 유저 기본 정보 (소셜 계정과 분리 — 다중 소셜 연동 지원)
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nickname      TEXT,
  profile_image TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 소셜 계정 연동 테이블 (1 user → N social accounts)
CREATE TABLE IF NOT EXISTS user_social_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  social_provider TEXT NOT NULL,
  social_id       TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(social_provider, social_id)
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- shop_name / shop_region 비정규화: Supabase JOIN 없이 읽기 가능
-- shop_id는 TEXT로 저장 (Supabase shops.id — 외래 키 제약 없음, 크로스 DB 불가)
CREATE TABLE IF NOT EXISTS favorites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shop_id     TEXT NOT NULL,
  shop_name   TEXT NOT NULL,
  shop_region TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, shop_id)
);

CREATE TABLE IF NOT EXISTS notification_settings (
  user_id           UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  near_enabled      BOOLEAN DEFAULT true,
  near_lat          DOUBLE PRECISION,
  near_lng          DOUBLE PRECISION,
  radius_km         INTEGER DEFAULT 3,
  favorite_enabled  BOOLEAN DEFAULT true,
  shop_news_enabled BOOLEAN DEFAULT false,
  fcm_token         TEXT,
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shop_id    TEXT NOT NULL,
  shop_name  TEXT NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('favorite', 'near')),
  slot_time  TEXT NOT NULL,
  slot_date  DATE NOT NULL,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_accounts_user   ON user_social_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user    ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_user         ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_date ON notifications(user_id, created_at DESC);
