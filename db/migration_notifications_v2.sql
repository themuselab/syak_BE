-- ============================================================
-- 알림 v2 — 비로그인 앱 소식(마케팅) 알림
-- AWS RDS에서 실행 (psql $DATABASE_URL -f db/migration_notifications_v2.sql)
--
-- 기존 notification_settings / notifications 는 '로그인 유저의 매장 알림'(favorite/near) 전용.
-- 앱 소식은 로그인과 무관한 전역 공지라 별도로 둔다:
--   push_devices : 익명 디바이스(설치 단위) FCM 토큰 + 앱소식 수신여부
--   app_news     : 전역 공지/마케팅 피드 (알림 탭에 로그인 여부와 무관하게 노출)
-- ============================================================

-- 익명 디바이스 등록 (로그인 불필요). 앱이 설치마다 생성하는 device_id 를 PK로.
CREATE TABLE IF NOT EXISTS push_devices (
  device_id        TEXT PRIMARY KEY,
  fcm_token        TEXT NOT NULL,
  platform         TEXT,                                   -- 'ios' | 'android'
  app_news_enabled BOOLEAN NOT NULL DEFAULT true,
  user_id          UUID REFERENCES users(id) ON DELETE SET NULL,  -- 로그인 시 연결(선택)
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 앱소식 발송 대상(수신 켠 디바이스)만 빠르게 훑기 위한 부분 인덱스
CREATE INDEX IF NOT EXISTS idx_push_devices_appnews
  ON push_devices(app_news_enabled) WHERE app_news_enabled;

-- 같은 FCM 토큰이 여러 device_id로 중복 등록되는 것 방지(앱 재설치 등)
CREATE UNIQUE INDEX IF NOT EXISTS uq_push_devices_token ON push_devices(fcm_token);

-- 전역 앱 소식(공지/마케팅) 피드
CREATE TABLE IF NOT EXISTS app_news (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  body         TEXT NOT NULL,
  link         TEXT,          -- 눌렀을 때 이동할 딥링크/URL (선택)
  image_url    TEXT,          -- 썸네일 (선택)
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_news_published ON app_news(published_at DESC);
