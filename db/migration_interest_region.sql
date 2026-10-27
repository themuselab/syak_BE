-- 관심 동네(2026-10-27): 사용자가 직접 고른 행정동 묶음. near_lat/near_lng = 그 동네 중심.
-- 서버 기동 시 src/server.ts가 같은 문장을 실행한다(수동 적용 불필요).
ALTER TABLE notification_settings
  ADD COLUMN IF NOT EXISTS region_code TEXT,
  ADD COLUMN IF NOT EXISTS region_name TEXT;
