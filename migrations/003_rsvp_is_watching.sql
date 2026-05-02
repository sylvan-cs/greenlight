-- Add is_watching column to rsvps for the co-watcher flow.
--
-- This column was referenced in commit e705026 ("Add co-watcher flow and
-- group notifications") in both the frontend (RoundDetail.tsx, SharePage.tsx,
-- types.ts) and the Python scraper (check_teetimes.py:_check_round_matches),
-- but the migration was never shipped. The result: every match scan failed
-- silently when the embedded rsvps select hit a non-existent column, so no
-- match emails ever fired.
--
-- Front-end writes also no-op'd because they used `(supabase as any).update`
-- without checking the result.
--
-- Run this in the Supabase SQL editor.

ALTER TABLE rsvps
  ADD COLUMN IF NOT EXISTS is_watching boolean NOT NULL DEFAULT false;
