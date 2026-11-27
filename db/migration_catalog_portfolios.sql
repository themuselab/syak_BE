-- Shop identity and source provenance survive catalog reclassification.
CREATE TABLE IF NOT EXISTS catalog_portfolio_images (
  shop_id text NOT NULL CHECK (shop_id ~ '^[0-9]{1,24}$'),
  shop_name text NOT NULL,
  categories jsonb NOT NULL,
  naver_place_url text GENERATED ALWAYS AS ('https://m.place.naver.com/place/' || shop_id || '/home') STORED,
  instagram_handle text NOT NULL,
  post_code text NOT NULL CHECK (post_code ~ '^[A-Za-z0-9_-]+$'),
  instagram_post_url text GENERATED ALWAYS AS ('https://www.instagram.com/p/' || post_code || '/') STORED,
  slide integer NOT NULL CHECK (slide >= 1),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  s3_bucket text NOT NULL,
  s3_key text NOT NULL,
  archived_at timestamptz NOT NULL,
  PRIMARY KEY (shop_id,post_code,sha256),
  CHECK (s3_key = 'catalog-portfolios/instagram/' || shop_id || '/' || sha256 || '.jpg')
);

CREATE TABLE IF NOT EXISTS catalog_portfolio_candidates (
  shop_id text NOT NULL CHECK (shop_id ~ '^[0-9]{1,24}$'),
  shop_name text NOT NULL,
  categories jsonb NOT NULL,
  naver_place_url text GENERATED ALWAYS AS ('https://m.place.naver.com/place/' || shop_id || '/home') STORED,
  instagram_handle text NOT NULL,
  post_code text NOT NULL CHECK (post_code ~ '^[A-Za-z0-9_-]+$'),
  instagram_post_url text GENERATED ALWAYS AS ('https://www.instagram.com/p/' || post_code || '/') STORED,
  slide integer NOT NULL CHECK (slide >= 1),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  s3_bucket text NOT NULL, s3_key text NOT NULL,
  review_status text NOT NULL CHECK (review_status IN ('pending_review','selected','rejected')),
  discovered_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
  PRIMARY KEY(shop_id,post_code,slide,sha256),
  CONSTRAINT catalog_candidate_object_key CHECK (
    s3_key = 'catalog-portfolios/pending_review/instagram/' || shop_id || '/' || post_code || '/' || slide::text || '/' || sha256 || '.jpg'
    OR s3_key = 'catalog-portfolios/instagram/' || shop_id || '/' || sha256 || '.jpg'
  )
);
