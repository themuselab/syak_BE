-- ============================================================
-- Syak 통합 Dev/Test DB Schema
-- Docker 개발/E2E 테스트용. 실제 운영:
--   shops/slots → Supabase (스크래퍼 소유)
--   users/...   → AWS RDS (앱 소유)
-- ⚠️  shops/slots 컬럼명을 Supabase 실제 스키마와 동일하게 유지
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Supabase 소유 테이블 (로컬 dev에서 통합) ─────────────────

CREATE TABLE IF NOT EXISTS shops (
  id                   TEXT PRIMARY KEY,
  name                 TEXT NOT NULL,
  category             TEXT,
  categories           JSONB DEFAULT '[]',
  gu                   TEXT,                   -- 구 (예: 강남구)
  lat                  DOUBLE PRECISION,
  lng                  DOUBLE PRECISION,
  representative_image TEXT,                   -- 대표 이미지 URL
  review_count         INTEGER DEFAULT 0,
  price_tier           TEXT,
  min_price            INTEGER,
  biz_id               TEXT,
  item_id              TEXT,
  biz_type             INTEGER,
  item_ids             JSONB DEFAULT '[]',
  services             JSONB DEFAULT '[]',
  items                JSONB DEFAULT '[]',
  detail               JSONB,                  -- phone, hoursText, menus, images, reservationRoutes 등
  slot_summary         JSONB DEFAULT '[]',
  event_desc           TEXT,
  event_price          TEXT,
  is_partner           BOOLEAN DEFAULT false,
  today_open           BOOLEAN DEFAULT false,
  first_visit_deal     BOOLEAN DEFAULT false,
  has_event            BOOLEAN DEFAULT false,
  reservable           BOOLEAN DEFAULT false,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- Supabase slots 스키마: shop_id, biz_id, item_id, slot_date, start_time, fetched_at
-- 로컬에서는 date 컬럼명 사용 (DATE 타입으로 UNIQUE 제약 효율적)
CREATE TABLE IF NOT EXISTS slots (
  id         BIGSERIAL PRIMARY KEY,
  shop_id    TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  date       DATE NOT NULL,
  start_time TIME NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(shop_id, date, start_time)
);

-- ── RDS 소유 테이블 ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nickname      TEXT,
  profile_image TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

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

-- ── LISTEN/NOTIFY 트리거 ─────────────────────────────────────

CREATE OR REPLACE FUNCTION notify_slot_inserted()
RETURNS TRIGGER AS $$
DECLARE
  payload JSONB;
BEGIN
  SELECT jsonb_build_object(
    'shopId',   NEW.shop_id,
    'shopName', s.name,
    'shopLat',  s.lat,
    'shopLng',  s.lng,
    'slotDate', NEW.date::text,
    'slotTime', to_char(NEW.start_time, 'HH24:MI')
  ) INTO payload
  FROM shops s WHERE s.id = NEW.shop_id;

  PERFORM pg_notify('slot_inserted', payload::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_slot_inserted ON slots;
CREATE TRIGGER trg_slot_inserted
  AFTER INSERT ON slots
  FOR EACH ROW EXECUTE FUNCTION notify_slot_inserted();

-- ── 인덱스 ───────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_social_accounts_user    ON user_social_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user     ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_slots_shop_date         ON slots(shop_id, date);
CREATE INDEX IF NOT EXISTS idx_slots_date_time         ON slots(date, start_time);
CREATE INDEX IF NOT EXISTS idx_shops_gu                ON shops(gu);
CREATE INDEX IF NOT EXISTS idx_shops_today             ON shops(today_open);
CREATE INDEX IF NOT EXISTS idx_favorites_user          ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_date ON notifications(user_id, created_at DESC);

-- ── 로컬 개발용 최소 샘플 (seed-shops.sql 로드 전 fallback) ──
-- seed-shops.sql 실행하면 이 데이터는 덮어쓰기됨

INSERT INTO shops (id, name, gu, min_price, price_tier, today_open, is_partner, categories, lat, lng, review_count)
VALUES
  ('shop_001', '민지네일', '강남구', 25000, '2만원대', true,  true,  '["nail"]',        37.4979, 127.0276, 28),
  ('shop_002', '뷰티살롱',  '마포구', 15000, '1만원대', true,  false, '["hair","nail"]', 37.5559, 126.9211, 12),
  ('shop_003', '태닝나우',  '송파구', 35000, '3만원대', false, false, '["waxing"]',      37.5145, 127.1058, 5)
ON CONFLICT (id) DO NOTHING;

INSERT INTO slots (shop_id, date, start_time)
VALUES
  ('shop_001', CURRENT_DATE,     '14:00'),
  ('shop_001', CURRENT_DATE,     '15:30'),
  ('shop_001', CURRENT_DATE + 1, '10:00'),
  ('shop_002', CURRENT_DATE,     '13:00'),
  ('shop_002', CURRENT_DATE + 1, '16:00')
ON CONFLICT DO NOTHING;
