-- ============================================================
-- 서버 측 추적 데이터 보강 — 2026-11-01
-- 운영 DB는 직접 접근 경로가 없어 server.ts 기동 시 동일 SQL을 멱등 실행한다
-- (src/shared/lib/trackingMigration.ts). 수동 실행 시: psql $DATABASE_URL -f db/migration_tracking.sql
-- 의미/용도: docs/13-tracking.md
-- ============================================================

-- 즐겨찾기 추가/해제 이력(favorites 는 현재 상태만 가짐 → 해제가 안 남던 문제)
CREATE TABLE IF NOT EXISTS favorite_events (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shop_id    TEXT NOT NULL,
  action     TEXT NOT NULL CHECK (action IN ('add', 'remove')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_favorite_events_time ON favorite_events(created_at);
CREATE INDEX IF NOT EXISTS idx_favorite_events_user ON favorite_events(user_id, created_at);

-- 관심 동네를 처음 설정/변경한 시각(updated_at 은 다른 설정 변경에도 갱신돼 구분 불가)
ALTER TABLE notification_settings ADD COLUMN IF NOT EXISTS region_set_at TIMESTAMPTZ;

-- 푸시: Expo 전달 성공 시각 / 사용자가 푸시를 탭해 연 시각
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS pushed_at TIMESTAMPTZ;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ;

-- 지표 집계용(기간 필터)
CREATE INDEX IF NOT EXISTS idx_slot_alerts_created ON slot_alerts(created_at);
CREATE INDEX IF NOT EXISTS idx_view_events_time ON shop_view_events(viewed_at);
CREATE TABLE IF NOT EXISTS analytics_events (
  event_id UUID PRIMARY KEY, session_id TEXT NOT NULL, event_name TEXT NOT NULL,
  platform TEXT NOT NULL, shop_id TEXT, shop_type TEXT, reservation_method TEXT,
  occurred_at TIMESTAMPTZ NOT NULL, received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS analytics_events_time ON analytics_events(occurred_at);
CREATE INDEX IF NOT EXISTS analytics_events_session ON analytics_events(session_id, occurred_at);
