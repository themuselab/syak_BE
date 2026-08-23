-- 슬롯 RDS 이전에 따른 인덱스 (search/sync 쿼리 seq scan 방지 → RDS 비용/부하 절감)
-- 2026-08-22.

-- /slots/search: date + start_time 매칭 (전 샵 스캔)
CREATE INDEX IF NOT EXISTS idx_slots_date_time ON slots(date, start_time);

-- /slots/shop/:id 및 sync delete: (shop_id, date)는 idx_slots_shop로 이미 커버됨.

-- 가용 슬롯만 자주 조회 → 부분 인덱스(예약/만료 제외)로 스캔 범위 축소
CREATE INDEX IF NOT EXISTS idx_slots_available ON slots(date, start_time)
  WHERE status NOT IN ('reserved','expired');
