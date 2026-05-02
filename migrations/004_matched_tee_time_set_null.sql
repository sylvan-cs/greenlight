-- Change rounds.matched_tee_time_id FK to ON DELETE SET NULL.
--
-- The scraper deletes tee_times older than 30 days. If any of those
-- tee_times is still referenced by a rounds.matched_tee_time_id, the
-- delete fails with FK constraint 'rounds_matched_tee_time_id_fkey'.
-- That exception was killing the whole sync block in
-- check_teetimes.py — fresh tee_times never got upserted, so the
-- matcher had nothing to match against and no notification emails
-- ever fired.
--
-- Switching the FK to ON DELETE SET NULL lets the cleanup proceed:
-- the old tee_time goes, and any round that pointed at it just loses
-- its matched_tee_time_id reference. That's correct semantically —
-- a round whose match is so old we're garbage-collecting it has no
-- meaningful pointer to preserve.
--
-- Run in Supabase SQL editor.

ALTER TABLE rounds
  DROP CONSTRAINT IF EXISTS rounds_matched_tee_time_id_fkey;

ALTER TABLE rounds
  ADD CONSTRAINT rounds_matched_tee_time_id_fkey
    FOREIGN KEY (matched_tee_time_id)
    REFERENCES tee_times(id)
    ON DELETE SET NULL;
