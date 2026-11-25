-- Removal requests / confirmed non-service listings. Keep only the identifier
-- and reason needed to prevent re-ingestion; never retain the removed profile.
BEGIN;
CREATE TABLE IF NOT EXISTS shop_suppressions (
  shop_id text PRIMARY KEY,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS shop_category_overrides (
  shop_id text PRIMARY KEY,
  category text NOT NULL,
  source_category text NOT NULL,
  checked_at timestamptz NOT NULL DEFAULT now()
);
-- Individually checked on Naver Place, 2026-11-25. Prevent a stale importer
-- from reassigning these skin/body-care businesses to massage.
INSERT INTO shop_category_overrides(shop_id,category,source_category) VALUES
('1906094879','피부','피부,체형관리'),('21007406','피부','피부,체형관리'),
('1071340397','피부','피부,체형관리'),('2049715373','피부','피부,체형관리')
ON CONFLICT (shop_id) DO NOTHING;
CREATE OR REPLACE FUNCTION prevent_suppressed_shop_write() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE corrected shop_category_overrides%ROWTYPE;
BEGIN
  IF EXISTS (SELECT 1 FROM shop_suppressions WHERE shop_id = NEW.id::text) THEN
    RETURN NULL;
  END IF;
  SELECT * INTO corrected FROM shop_category_overrides WHERE shop_id=NEW.id::text;
  IF FOUND THEN
    NEW.category := corrected.category;
    NEW.categories := jsonb_build_array(corrected.category);
    NEW.detail := COALESCE(NEW.detail,'{}'::jsonb) || jsonb_build_object(
      'category',corrected.category,'categories',jsonb_build_array(corrected.category),
      'sourceCategory',corrected.source_category,'sourceCategoryCheckedAt',corrected.checked_at);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS shops_suppression_guard ON shops;
CREATE TRIGGER shops_suppression_guard BEFORE INSERT OR UPDATE ON shops
FOR EACH ROW EXECUTE FUNCTION prevent_suppressed_shop_write();
COMMIT;
