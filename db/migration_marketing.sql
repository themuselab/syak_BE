-- 마케팅 성과 스냅샷 (인스타 · 쓰레드 · 메타 광고)
-- ⚠️ 이 테이블은 Supabase에 생성합니다. (스킬이 어느 PC서든 직접 write, 관리자는 백엔드 경유 read)
--    적용: Supabase 대시보드 → SQL Editor 에 아래를 붙여넣고 실행.
--
-- 하루 1건, snapshot_date 기준 upsert.
-- data(jsonb)에는 화면 렌더 구조 그대로 저장 → 관리자는 변환 없이 렌더.
--   {
--     "metaAds":   [ { "label": "광고 지출", "value": "₩320,000", "delta": "+12%", "up": true }, ... ],
--     "instagram": { "profileUrl": "...", "aiAdvice": "...", "aiFollowUp": "...",
--                    "totals": [ { "label": "도달", "value": "12.5K" }, ... ],
--                    "topPosts": [ { "caption": "...", "metric": "저장 210", "sub": "도달 8.2K" }, ... ] },
--     "threads":   { ...instagram 과 동일 구조... },
--     "images":    [ { "id": "...", "url": "https://.../a.png", "caption": "시안 1" }, ... ]  -- S3/Storage URL
--   }

CREATE TABLE IF NOT EXISTS marketing_snapshots (
  snapshot_date DATE PRIMARY KEY,
  data          JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketing_snapshots_date
  ON marketing_snapshots (snapshot_date DESC);

-- service_role 키(백엔드·스킬)는 RLS를 우회하므로 별도 정책 불필요.
-- (anon 키로는 접근 못하게 RLS는 켜두는 것을 권장)
ALTER TABLE marketing_snapshots ENABLE ROW LEVEL SECURITY;


-- ── 토큰 보관 (GitHub Actions 자동화의 자가치유용) ───────────────
-- 인스타 토큰은 60일 만료라, 매 실행마다 만료 임박 시 갱신 후 여기에 다시 저장한다.
-- 이렇게 하면 워크플로가 60일 안에 한 번이라도 돌면 토큰이 영구히 유지된다.
CREATE TABLE IF NOT EXISTS marketing_tokens (
  key        TEXT PRIMARY KEY,          -- 'instagram' | 'meta_ads' ...
  token      TEXT NOT NULL,
  expires_at TIMESTAMPTZ,               -- NULL = 만료 없음(시스템 사용자 토큰 등)
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE marketing_tokens ENABLE ROW LEVEL SECURITY;
