-- ============================================================
-- 빈자리 알림 신청(slot alerts) — 2026-10-29
-- 운영 DB는 직접 접근 경로가 없어 server.ts 기동 시 동일 SQL을 멱등 실행한다.
-- (수동 실행 시: psql $DATABASE_URL -f db/migration_slot_alerts.sql)
-- ============================================================

-- 로그인 유저가 (샵, 날짜, 30분 단위 시간)을 골라 신청. 알림 1번 받으면 notified_at 기록 → 종료.
-- 시간이 지난 신청은 조회 시점에 '만료'로 계산(크론 없음).
CREATE TABLE IF NOT EXISTS slot_alerts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shop_id     TEXT NOT NULL,
  slot_date   DATE NOT NULL,
  slot_time   TEXT NOT NULL,            -- 'HH:MM'
  notified_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 활성 신청 중복 방지(멱등 신청: INSERT ... ON CONFLICT ... WHERE notified_at IS NULL DO NOTHING)
CREATE UNIQUE INDEX IF NOT EXISTS uq_slot_alerts_active
  ON slot_alerts(user_id, shop_id, slot_date, slot_time) WHERE notified_at IS NULL;

-- 디스패치 조회: 새 빈자리 (샵, 날짜, 시간) → 활성 신청자
CREATE INDEX IF NOT EXISTS idx_slot_alerts_dispatch
  ON slot_alerts(shop_id, slot_date, slot_time) WHERE notified_at IS NULL;

-- 내 신청 목록
CREATE INDEX IF NOT EXISTS idx_slot_alerts_user
  ON slot_alerts(user_id, created_at DESC);

-- notifications.type 에 'alert' 추가. 기존 CHECK('favorite','near')를 찾아 교체한다.
-- 이미 'alert'가 들어 있으면 아무것도 안 함(멱등). NOT VALID: 기존 행 재검사(풀스캔) 생략 — 새 행에는 적용됨.
DO $$
DECLARE c record;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'notifications'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%type%' AND pg_get_constraintdef(oid) LIKE '%alert%'
  ) THEN
    FOR c IN
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'notifications'::regclass AND contype = 'c'
        AND pg_get_constraintdef(oid) LIKE '%type%'
    LOOP
      EXECUTE format('ALTER TABLE notifications DROP CONSTRAINT %I', c.conname);
    END LOOP;
    ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
      CHECK (type IN ('favorite', 'near', 'alert')) NOT VALID;
  END IF;
END $$;
