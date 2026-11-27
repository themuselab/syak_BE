-- Source-only records. Canonical catalog rows retain their existing Naver identity.
CREATE TABLE IF NOT EXISTS semas_shop_candidates (
  public_id text PRIMARY KEY CHECK (public_id ~ '^MA[A-Z0-9]{1,38}$'),
  identity_key text NOT NULL CHECK (identity_key ~ '^[0-9a-f]{64}$'),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  branch text NOT NULL DEFAULT '',
  road_address text NOT NULL CHECK (length(btrim(road_address)) > 0),
  province text NOT NULL,
  district text NOT NULL,
  longitude double precision NOT NULL CHECK (longitude BETWEEN 124 AND 132),
  latitude double precision NOT NULL CHECK (latitude BETWEEN 32 AND 40),
  category text NOT NULL CHECK (category IN ('네일','메이크업','헤어')),
  category_basis text NOT NULL,
  public_subcategory text NOT NULL,
  industry text NOT NULL,
  source_url text NOT NULL,
  source_date date NOT NULL,
  shard smallint NOT NULL CHECK (shard BETWEEN 0 AND 31),
  active boolean NOT NULL DEFAULT true,
  proposed_place_id text CHECK (proposed_place_id ~ '^[0-9]{4,20}$'),
  verified_place_id text CHECK (verified_place_id ~ '^[0-9]{4,20}$'),
  verified_at timestamptz,
  checked_at timestamptz,
  outcome text CHECK (outcome IN ('verified','no_match','ambiguous','unavailable')),
  next_attempt_at timestamptz NOT NULL DEFAULT '-infinity',
  evidence jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((verified_place_id IS NULL) = (verified_at IS NULL)),
  CHECK (verified_place_id IS NULL OR outcome IS NOT DISTINCT FROM 'verified')
);
CREATE INDEX IF NOT EXISTS idx_semas_pending ON semas_shop_candidates(shard, public_id)
  WHERE active AND verified_place_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_semas_verified_place ON semas_shop_candidates(verified_place_id)
  WHERE active AND verified_place_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS semas_candidate_sync_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  source_date date NOT NULL,
  snapshot_mtime timestamptz NOT NULL,
  digest text NOT NULL,
  candidate_count integer NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);
