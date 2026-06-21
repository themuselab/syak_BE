-- ============================================================
-- Supabase Migration — 실시간 알림 트리거만 추가
-- shops / slots 는 이미 존재 (스크래퍼가 관리)
-- 앱 전용 테이블(users, favorites 등)은 AWS RDS에 있음
-- Supabase Dashboard → SQL Editor에서 실행
-- ============================================================

-- 실시간 슬롯 알림 트리거
-- slots INSERT → pg_notify('slot_inserted', JSON) → 백엔드 SlotListener → FCM

CREATE OR REPLACE FUNCTION notify_slot_inserted()
RETURNS TRIGGER AS $$
DECLARE
  payload JSONB;
BEGIN
  SELECT jsonb_build_object(
    'shopId',    NEW.shop_id,
    'shopName',  s.name,
    'shopLat',   s.lat,
    'shopLng',   s.lng,
    'slotDate',  NEW.date::text,
    'slotTime',  to_char(NEW.start_time, 'HH24:MI')
  ) INTO payload
  FROM shops s WHERE s.id = NEW.shop_id;

  PERFORM pg_notify('slot_inserted', payload::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_slot_inserted ON slots;
CREATE TRIGGER trg_slot_inserted
  AFTER INSERT ON slots
  FOR EACH ROW EXECUTE FUNCTION notify_slot_inserted();
