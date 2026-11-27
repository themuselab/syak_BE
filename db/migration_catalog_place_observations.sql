CREATE TABLE IF NOT EXISTS catalog_place_observations (
  shop_id text NOT NULL CHECK (shop_id ~ '^[0-9]{1,24}$'),
  checked_at timestamptz NOT NULL,
  naver_place_url text GENERATED ALWAYS AS ('https://m.place.naver.com/place/' || shop_id || '/home') STORED,
  visitor_review_count integer CHECK (visitor_review_count >= 0),
  reviews jsonb CHECK (jsonb_typeof(reviews)='array'),
  booking_items jsonb CHECK (jsonb_typeof(booking_items)='array'),
  PRIMARY KEY (shop_id,checked_at)
);
