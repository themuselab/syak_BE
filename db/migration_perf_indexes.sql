-- ============================================================
-- 관리자 통계 조회 속도 개선용 인덱스
--
-- ⚠️ 이 파일은 두 DB에 나눠 실행한다:
--   [A] Supabase (events/leads/shops) → Supabase Dashboard → SQL Editor
--   [B] AWS RDS   (users/owner_accounts/...) → psql $DATABASE_URL -f (또는 배포 스크립트)
--
-- 통계 핸들러들은 event 종류 + created_at 범위로 필터한다.
-- 이 인덱스가 없으면 21k+ events 전체 스캔 → 데이터가 쌓일수록 선형으로 느려진다.
-- ============================================================

-- ───────────────────────────────────────────────
-- [A] Supabase 에서 실행
-- ───────────────────────────────────────────────

-- shopViewStats / visitorTrend / reservationClickStats / getTrends 공통:
-- WHERE event = ? AND created_at >= ? (+ shop_id 사용). shop_id를 INCLUDE 해
-- index-only scan 가능하게 → 힙 접근 없이 집계.
CREATE INDEX IF NOT EXISTS idx_events_event_created
  ON events (event, created_at) INCLUDE (shop_id);

-- cancelRequestStats: WHERE kind = ? AND created_at >= ?
CREATE INDEX IF NOT EXISTS idx_leads_kind_created
  ON leads (kind, created_at);

-- dashboardSummary / listPartnerShops: WHERE is_partner = true
CREATE INDEX IF NOT EXISTS idx_shops_is_partner
  ON shops (is_partner) WHERE is_partner = true;

-- ───────────────────────────────────────────────
-- [B] AWS RDS 에서 실행
-- ───────────────────────────────────────────────

-- getTrends: 각 테이블 created_at >= ? GROUP BY day
CREATE INDEX IF NOT EXISTS idx_users_created            ON users (created_at);
CREATE INDEX IF NOT EXISTS idx_owner_accounts_created   ON owner_accounts (created_at);
CREATE INDEX IF NOT EXISTS idx_partner_codes_created    ON partner_codes (created_at);

-- dashboardSummary: 검토 대기 문의 카운트
CREATE INDEX IF NOT EXISTS idx_shop_inquiries_status    ON shop_inquiries (status);

-- ============================================================
-- 후속(데이터가 더 커지면): 집계를 DB로 밀어 왕복 1회로 끝내기.
-- 현재는 stats가 1000행씩 여러 번 왕복해 전량 로드 후 JS로 집계한다.
-- 옵션 1) Supabase 에서 aggregate 허용 후 PostgREST select=shop_id,count() 사용
--         (현재 PGRST123 "aggregate functions not allowed" 로 비활성)
-- 옵션 2) RPC 함수(GROUP BY)로 만들고 sbClient.rpc() 호출
-- 둘 다 왕복 1회 + 수십 행 반환으로 바뀌어 수천 행 전송이 사라진다.
-- ============================================================
