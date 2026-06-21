-- ============================================================
-- migration_v2.sql — 기능 추가 (AD-003/AD-007/AD-008/AD-009/SO-000a)
-- 실행 대상: RDS (users, reservation_click_events, shop_inquiries)
-- ============================================================

-- 1. 예약 버튼 클릭 이벤트 추적 (CA-014 / AD-003)
CREATE TABLE IF NOT EXISTS reservation_click_events (
  id         BIGSERIAL PRIMARY KEY,
  shop_id    TEXT NOT NULL,
  user_id    UUID,
  clicked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reservation_clicks_shop ON reservation_click_events (shop_id, clicked_at);
CREATE INDEX IF NOT EXISTS idx_reservation_clicks_time ON reservation_click_events (clicked_at);

-- 2. 사용자 계정 상태 (AD-007): active | banned
ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
CREATE INDEX IF NOT EXISTS idx_users_status ON users (status);

-- 3. 샵 도입 문의 (SO-000a → AD-008): 사장님 셀프 신청 폼 저장
CREATE TABLE IF NOT EXISTS shop_inquiries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_name   TEXT NOT NULL,
  contact     TEXT NOT NULL,
  gu          TEXT NOT NULL,
  category    TEXT NOT NULL,
  note        TEXT,
  status      TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_shop_inquiries_status ON shop_inquiries (status, created_at DESC);
