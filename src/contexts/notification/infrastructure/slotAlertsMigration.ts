/**
 * 빈자리 알림 신청 스키마 — server.ts 기동 시 멱등 실행(운영 DB 직접 접근 경로가 없음).
 * db/migration_slot_alerts.sql 과 동일한 내용. 한쪽을 고치면 다른 쪽도 맞출 것.
 */
export const SLOT_ALERTS_MIGRATION_SQL = `
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
`;
