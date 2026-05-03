-- Add standby_mode flag for fast-poll rounds.
--
-- A round in standby mode is polled by a separate Railway service
-- (standby_poll.py) every 1-2 minutes against the booking systems'
-- direct APIs, instead of waiting for the 20-min main scrape cycle.
-- Use case: hard-to-get courses where the user wants instant alerts
-- on cancellations.
--
-- Capped at 3 active standby rounds per user (enforced client-side
-- and re-checked in standby_poll.py — no DB constraint, since we
-- don't want to hard-fail valid round creation if one user misuses).

ALTER TABLE rounds
  ADD COLUMN IF NOT EXISTS standby_mode boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS rounds_standby_active_idx
  ON rounds (round_date)
  WHERE standby_mode = true AND status IN ('open', 'watching');
