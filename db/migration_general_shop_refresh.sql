BEGIN;
CREATE TABLE IF NOT EXISTS catalog_general_refresh (
  shop_id text PRIMARY KEY,
  metadata_attempt_at timestamptz,
  metadata_at timestamptz,
  metadata_outcome text,
  slot_attempt_at timestamptz,
  slot_outcome text,
  availability_notice boolean,
  instagram_seen_at timestamptz
);
ALTER TABLE catalog_general_refresh ADD COLUMN IF NOT EXISTS availability_notice boolean;
CREATE INDEX IF NOT EXISTS catalog_general_ig_feed ON catalog_general_refresh(instagram_seen_at,shop_id)
  WHERE instagram_seen_at IS NOT NULL;
CREATE TABLE IF NOT EXISTS catalog_business_photo_intake (
  shop_id text NOT NULL,
  source_url text NOT NULL,
  observed_at timestamptz NOT NULL,
  retry_after timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  archived_at timestamptz,
  sha256 text,
  s3_bucket text,
  s3_key text,
  PRIMARY KEY(shop_id,source_url)
);
CREATE INDEX IF NOT EXISTS catalog_business_photo_pending ON catalog_business_photo_intake(retry_after,observed_at)
  WHERE s3_key IS NULL;
CREATE TABLE IF NOT EXISTS catalog_source_request_budget (
  source text NOT NULL,
  day date NOT NULL,
  used integer NOT NULL DEFAULT 0,
  granted integer NOT NULL DEFAULT 0,
  next_grant_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(source,day)
);
COMMIT;
