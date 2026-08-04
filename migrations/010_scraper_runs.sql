-- Observability for the scraper services.
--
-- Two Railway services run check_teetimes.py: the ~20min cron ("greenlight")
-- and the stand-by fast-poller ("jubilant-amazement"). Until now nothing
-- recorded which service ran, in what mode, or on what commit — so a service
-- silently running the WRONG mode (or not running at all) was invisible from
-- the database, and the only symptom was "alerts feel slow".
--
-- That is exactly what happened: the stand-by poller appears to run the
-- default railway.toml (cron every 20 min, no --standby --loop) instead of
-- railway.standby.toml, making it a second copy of the main cron. This table
-- makes that state observable in one query instead of inferring it from
-- tee_times timestamps.
--
-- Safe to apply anytime: additive, no changes to existing tables.

CREATE TABLE IF NOT EXISTS scraper_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service         text,            -- RAILWAY_SERVICE_NAME, or 'local'
  mode            text NOT NULL,   -- 'cron' | 'standby' | 'all'
  looping         boolean NOT NULL DEFAULT false,
  git_sha         text,            -- RAILWAY_GIT_COMMIT_SHA, so we can tell what code ran
  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz,
  courses_scanned int,
  rows_upserted   int,
  matches_sent    int,
  error           text
);

CREATE INDEX IF NOT EXISTS scraper_runs_started_idx
  ON scraper_runs (started_at DESC);

CREATE INDEX IF NOT EXISTS scraper_runs_service_started_idx
  ON scraper_runs (service, started_at DESC);

-- Written only by the scraper with the service-role key (bypasses RLS).
-- No client should read it, so enable RLS with no policies = deny all.
ALTER TABLE scraper_runs ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────── HOW TO USE IT ─────────────────────────────
-- Is each service alive, and in what mode?
--   SELECT service, mode, looping, count(*), max(started_at)
--   FROM scraper_runs
--   WHERE started_at > now() - interval '1 hour'
--   GROUP BY service, mode, looping
--   ORDER BY max(started_at) DESC;
--
-- Healthy looks like:
--   greenlight         | cron    | false | ~3   (every ~20 min)
--   jubilant-amazement | standby | true  | ~40  (every ~90 s)
--
-- If jubilant-amazement shows mode='cron'/looping=false, it is running the
-- default railway.toml — point that service at railway.standby.toml (Railway
-- Settings -> Config-as-code path) or set its start command explicitly to:
--   python check_teetimes.py --standby --loop --interval-seconds 90
--
-- If jubilant-amazement is absent entirely, the service is down or crashing.
