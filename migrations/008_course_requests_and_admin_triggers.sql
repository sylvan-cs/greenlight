-- Admin notifications + course_requests table.
--
-- Frontend was already calling supabase.from('course_requests').insert(...)
-- at CourseSelector.tsx:159 but the table never existed, so every "Request It"
-- click silently failed (with a misleading "Got it!" UI confirmation).
--
-- This migration:
--   1. Creates course_requests (matches the existing TypeScript types)
--   2. Enables pg_net so Postgres triggers can call the Vercel admin-notify
--      endpoint over HTTP
--   3. Adds AFTER INSERT triggers on profiles and course_requests that POST
--      to /api/admin-notify on https://thestarter.golf
--
-- Secrets are NOT hardcoded here. The trigger reads the endpoint URL and shared
-- secret from Postgres database-level settings (GUCs) at fire time. You must
-- set those after applying this migration. See the bottom of this file for
-- the exact ALTER DATABASE commands to run.

-- ── 1. course_requests table ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS course_requests (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_name text NOT NULL,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS course_requests_created_at_idx
  ON course_requests (created_at DESC);

ALTER TABLE course_requests ENABLE ROW LEVEL SECURITY;

-- A signed-in user can insert a request tagged with their own id, and read
-- their own past requests. Service role bypasses RLS so the weekly summary
-- endpoint can read everything.
DROP POLICY IF EXISTS "course_requests_user_insert" ON course_requests;
CREATE POLICY "course_requests_user_insert"
  ON course_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "course_requests_user_read" ON course_requests;
CREATE POLICY "course_requests_user_read"
  ON course_requests FOR SELECT
  USING (auth.uid() = user_id);

-- ── 2. pg_net (Supabase ships it; enable if not already) ────────────────
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ── 3. Shared helper: POST a JSON event to the admin-notify endpoint ────
CREATE OR REPLACE FUNCTION notify_admin_event(event_type text, payload jsonb)
RETURNS void AS $$
DECLARE
  notify_url    text;
  notify_secret text;
BEGIN
  -- Read endpoint config from database-level settings. If either is missing
  -- we noop rather than crash the INSERT that fired us.
  BEGIN
    notify_url    := current_setting('app.admin_notify_url', true);
    notify_secret := current_setting('app.admin_notify_secret', true);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'notify_admin_event: settings unreadable, skipping';
    RETURN;
  END;

  IF notify_url IS NULL OR notify_url = '' THEN
    RAISE NOTICE 'notify_admin_event: app.admin_notify_url not set, skipping';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := notify_url,
    headers := jsonb_build_object(
      'Content-Type',   'application/json',
      'x-admin-secret', COALESCE(notify_secret, '')
    ),
    body := jsonb_build_object(
      'event', event_type,
      'data',  payload
    ),
    timeout_milliseconds := 5000
  );
EXCEPTION WHEN OTHERS THEN
  -- Never let a notification failure block the parent insert.
  RAISE NOTICE 'notify_admin_event(%) failed: %', event_type, SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 4. Trigger: new user (profile insert) ──────────────────────────────
CREATE OR REPLACE FUNCTION trg_notify_admin_new_user()
RETURNS trigger AS $$
DECLARE
  user_email text;
BEGIN
  SELECT email INTO user_email FROM auth.users WHERE id = NEW.id;
  PERFORM notify_admin_event('new_user', jsonb_build_object(
    'user_id',    NEW.id,
    'full_name',  NEW.full_name,
    'email',      user_email,
    'created_at', NEW.created_at
  ));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS profiles_notify_admin ON profiles;
CREATE TRIGGER profiles_notify_admin
  AFTER INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION trg_notify_admin_new_user();

-- ── 5. Trigger: new course request ──────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_notify_admin_course_request()
RETURNS trigger AS $$
DECLARE
  user_name  text;
  user_email text;
BEGIN
  SELECT p.full_name, u.email
    INTO user_name, user_email
  FROM profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE p.id = NEW.user_id;

  PERFORM notify_admin_event('course_request', jsonb_build_object(
    'request_id',  NEW.id,
    'course_name', NEW.course_name,
    'user_id',     NEW.user_id,
    'user_name',   user_name,
    'user_email',  user_email,
    'created_at',  NEW.created_at
  ));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS course_requests_notify_admin ON course_requests;
CREATE TRIGGER course_requests_notify_admin
  AFTER INSERT ON course_requests
  FOR EACH ROW EXECUTE FUNCTION trg_notify_admin_course_request();

-- ── POST-MIGRATION SETUP (run these once in the Supabase SQL editor) ────
--
-- 1. Set the endpoint URL and a shared secret. Replace <SECRET> with the
--    same value you set in Vercel as ADMIN_NOTIFY_SECRET.
--
--    ALTER DATABASE postgres
--      SET app.admin_notify_url = 'https://thestarter.golf/api/admin-notify';
--    ALTER DATABASE postgres
--      SET app.admin_notify_secret = '<SECRET>';
--
-- 2. Disconnect/reconnect any open sessions so the new settings load. The
--    pg_net background worker reads the GUC at every trigger fire.
--
-- 3. Smoke test:
--
--    INSERT INTO course_requests (course_name, user_id)
--    VALUES ('Pebble Beach', (SELECT id FROM auth.users LIMIT 1));
--
--    Within ~5s an email should arrive at the admin address.
