-- 사장님 웹앱(syak_owner) 대시보드/빈자리/프로필/알림 지원
-- 2026-08-20. RDS 전용. (slots/shops는 원래 Supabase에 있고, owner-slots 레포는
-- RDS 풀을 쓰도록 배선돼 있어 RDS에 owner용 slots 테이블을 생성한다. shops FK는 제외 — shops는 Supabase.)

-- ── owner용 slots 테이블 (RDS) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS slots (
  id         BIGSERIAL PRIMARY KEY,
  shop_id    TEXT NOT NULL,
  date       DATE NOT NULL,
  start_time TIME NOT NULL,
  source     TEXT NOT NULL DEFAULT 'owner' CHECK (source IN ('scraper','owner')),
  owner_id   UUID REFERENCES owner_accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_slots_shop ON slots(shop_id, date);

-- ── slots 확장: 종료시간·시술항목·상태·수신자수·예약정보 ──────────────
ALTER TABLE slots ADD COLUMN IF NOT EXISTS end_time      TIME;
ALTER TABLE slots ADD COLUMN IF NOT EXISTS service_items TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE slots ADD COLUMN IF NOT EXISTS status        TEXT NOT NULL DEFAULT 'waiting'
  CHECK (status IN ('waiting','notified','reserved','expired'));
ALTER TABLE slots ADD COLUMN IF NOT EXISTS recipient_count   INT NOT NULL DEFAULT 0;
ALTER TABLE slots ADD COLUMN IF NOT EXISTS reserved_amount   INT;
ALTER TABLE slots ADD COLUMN IF NOT EXISTS reserved_customer TEXT;
ALTER TABLE slots ADD COLUMN IF NOT EXISTS reserved_at       TIMESTAMPTZ;

-- ── owner_accounts: 프로필 필드(계정 설정 화면) ──────────────────────
ALTER TABLE owner_accounts ADD COLUMN IF NOT EXISTS name  TEXT;
ALTER TABLE owner_accounts ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE owner_accounts ADD COLUMN IF NOT EXISTS email TEXT;

-- ── 사장님 활동 알림(취소석 발송 / 예약 확정 / 빈자리 만료) ──────────
CREATE TABLE IF NOT EXISTS owner_notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   UUID NOT NULL REFERENCES owner_accounts(id) ON DELETE CASCADE,
  shop_id    TEXT,
  kind       TEXT NOT NULL CHECK (kind IN ('dispatched','reserved','expired')),
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  slot_id    BIGINT,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_owner_notif_owner
  ON owner_notifications(owner_id, created_at DESC);

-- 만료 알림 중복 방지: 슬롯당 만료 알림 1건
CREATE UNIQUE INDEX IF NOT EXISTS uq_owner_notif_expired
  ON owner_notifications(slot_id) WHERE kind = 'expired';
