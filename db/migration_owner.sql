-- 사장님(파트너 오너) 관련 테이블
-- 소비자 users/user_social_accounts와 완전히 분리된 별도 계정 체계

CREATE TABLE IF NOT EXISTS owner_accounts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id       TEXT REFERENCES shops(id) ON DELETE SET NULL,
  nickname      TEXT,
  profile_image TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_owner_accounts_shop
  ON owner_accounts(shop_id) WHERE shop_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS owner_social_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID NOT NULL REFERENCES owner_accounts(id) ON DELETE CASCADE,
  social_provider TEXT NOT NULL CHECK (social_provider IN ('kakao','naver','apple')),
  social_id       TEXT NOT NULL,
  UNIQUE (social_provider, social_id)
);
CREATE INDEX IF NOT EXISTS idx_owner_social_owner
  ON owner_social_accounts(owner_id);

CREATE TABLE IF NOT EXISTS owner_refresh_tokens (
  token      TEXT PRIMARY KEY,
  owner_id   UUID NOT NULL REFERENCES owner_accounts(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_owner_refresh_owner
  ON owner_refresh_tokens(owner_id);

-- 관리자 발급 파트너 인증코드 (8자리, 일회성, 7일 만료)
CREATE TABLE IF NOT EXISTS partner_codes (
  code       TEXT PRIMARY KEY,
  shop_id    TEXT NOT NULL REFERENCES shops(id),
  used       BOOLEAN NOT NULL DEFAULT FALSE,
  used_by    UUID REFERENCES owner_accounts(id),
  used_at    TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partner_codes_shop
  ON partner_codes(shop_id);

-- 샵 조회 이벤트 (analytics 용)
CREATE TABLE IF NOT EXISTS shop_view_events (
  id        BIGSERIAL PRIMARY KEY,
  shop_id   TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  viewed_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_view_events_shop_time
  ON shop_view_events(shop_id, viewed_at);

-- slots에 source / owner_id 컬럼 추가
ALTER TABLE slots ADD COLUMN IF NOT EXISTS source   TEXT DEFAULT 'scraper'
  CHECK (source IN ('scraper','owner'));
ALTER TABLE slots ADD COLUMN IF NOT EXISTS owner_id UUID
  REFERENCES owner_accounts(id) ON DELETE SET NULL;
