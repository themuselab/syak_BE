-- 관리자 샵 목록 속도 (기본 인기순 정렬 + 이름 정렬)
CREATE INDEX IF NOT EXISTS idx_shops_review ON shops(review_count DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_shops_name   ON shops(name);
