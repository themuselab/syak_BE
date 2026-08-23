-- 취소석 알림 신청 (소비자 웹) — Supabase leads 이전
CREATE TABLE IF NOT EXISTS leads (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone      TEXT NOT NULL,
  district   TEXT,
  category   TEXT,
  kind       TEXT NOT NULL DEFAULT 'missed_seat_alert',
  created_at TIMESTAMPTZ DEFAULT now()
);
