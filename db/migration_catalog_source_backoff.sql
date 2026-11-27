CREATE TABLE IF NOT EXISTS public.catalog_source_backoff (
  source text PRIMARY KEY CHECK (source='naver'),
  until_at timestamptz NOT NULL DEFAULT '-infinity',
  manual_hold boolean NOT NULL DEFAULT false,
  reason text,
  strikes int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.catalog_source_backoff(source) VALUES ('naver') ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION public.catalog_report_source_limit(src text, http_status integer, retry_seconds integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  prior public.catalog_source_backoff%ROWTYPE;
  stamp timestamptz := clock_timestamp();
  strike int;
  deadline timestamptz;
BEGIN
  IF src IS DISTINCT FROM 'naver' OR http_status IS NULL OR http_status NOT IN (401,403,429,503) OR retry_seconds < 0 THEN
    RAISE EXCEPTION 'Unsupported source limit';
  END IF;
  SELECT * INTO STRICT prior FROM public.catalog_source_backoff WHERE source=src FOR UPDATE;
  -- Multiple observers can report the same block. Count a new strike only after the previous wait.
  strike := CASE WHEN prior.until_at > stamp THEN prior.strikes
                 WHEN prior.strikes=0 OR prior.until_at < stamp - interval '1 day' THEN 1
                 ELSE LEAST(prior.strikes+1,16) END;
  deadline := CASE WHEN prior.until_at > stamp THEN prior.until_at
                   ELSE stamp + make_interval(secs=>LEAST(86400,900 * (2 ^ LEAST(GREATEST(strike-1,0),7))::int)) END;
  UPDATE public.catalog_source_backoff SET
    until_at=GREATEST(deadline,stamp+make_interval(secs=>coalesce(retry_seconds,0))),
    manual_hold=prior.manual_hold OR http_status IN (401,403),
    reason='HTTP '||http_status,strikes=strike,updated_at=stamp WHERE source=src;
END $$;
REVOKE ALL ON FUNCTION public.catalog_report_source_limit(text,integer,integer) FROM PUBLIC;
