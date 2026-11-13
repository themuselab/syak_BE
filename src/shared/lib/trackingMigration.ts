/**
 * 서버 측 추적(트래킹) 스키마 — server.ts 기동 시 멱등 실행(운영 DB 직접 접근 경로가 없음).
 * db/migration_tracking.sql 과 동일한 내용. 한쪽을 고치면 다른 쪽도 맞출 것.
 * 자세한 의미는 docs/13-tracking.md.
 */
export const TRACKING_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS analytics_events (
  event_id UUID PRIMARY KEY,
  session_id TEXT NOT NULL,
  event_name TEXT NOT NULL,
  platform TEXT NOT NULL,
  shop_id TEXT,
  shop_type TEXT,
  reservation_method TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS analytics_events_time ON analytics_events(occurred_at);
CREATE INDEX IF NOT EXISTS analytics_events_session ON analytics_events(session_id, occurred_at);
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
`;
