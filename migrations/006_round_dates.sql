-- Multi-date rounds: a round can ask the matcher to look across multiple
-- candidate dates ("any time Sat or Sun morning"). The first acceptable
-- tee time on any of those dates locks the round.
--
-- Schema strategy: junction table (round_id, round_date) mirroring the
-- existing round_courses pattern. rounds.round_date stays populated as
-- the *earliest* selected date (used for backward compat: legacy queries,
-- Home card subtitle, "round_date >= today" filters). The matcher and
-- detail UI read from round_dates for the full list.
--
-- Run in Supabase SQL editor. Non-destructive — backfills existing rounds.

CREATE TABLE IF NOT EXISTS round_dates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id    uuid NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  round_date  date NOT NULL,
  UNIQUE (round_id, round_date)
);

CREATE INDEX IF NOT EXISTS round_dates_round_idx
  ON round_dates (round_id);

CREATE INDEX IF NOT EXISTS round_dates_date_idx
  ON round_dates (round_date);

-- Backfill from existing rounds — every existing round gets one row in
-- round_dates with its current round_date. ON CONFLICT skips if the
-- migration is re-run.
INSERT INTO round_dates (round_id, round_date)
SELECT id, round_date
FROM rounds
WHERE round_date IS NOT NULL
ON CONFLICT (round_id, round_date) DO NOTHING;

-- RLS: same policy shape as round_courses — anyone who can read a round
-- can read its dates.
ALTER TABLE round_dates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "round_dates_read"
  ON round_dates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM rounds r
      WHERE r.id = round_dates.round_id
        AND (
          r.creator_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM rsvps rs
            WHERE rs.round_id = r.id AND rs.user_id = auth.uid()
          )
        )
    )
  );

-- Insert/delete: round creator only.
CREATE POLICY "round_dates_creator_write"
  ON round_dates FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM rounds r
      WHERE r.id = round_dates.round_id AND r.creator_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM rounds r
      WHERE r.id = round_dates.round_id AND r.creator_id = auth.uid()
    )
  );
