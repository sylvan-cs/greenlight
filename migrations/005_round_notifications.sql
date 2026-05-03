-- Track every match notification we send so the scraper can:
--   1. Avoid re-sending the same tee_time options to the same recipient
--   2. Rate-limit follow-ups (one per round per 12h window)
--   3. Send each round's "final reminder" exactly once
--
-- The scraper writes to this table from check_teetimes.py with the
-- service role key, so RLS only needs to permit reads for round
-- creators (and only insert via service role).

CREATE TABLE IF NOT EXISTS round_notifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id        uuid NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  notification_type text NOT NULL CHECK (notification_type IN ('match', 'followup', 'final')),
  tee_time_ids    uuid[] NOT NULL DEFAULT '{}',
  sent_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS round_notifications_round_sent_idx
  ON round_notifications (round_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS round_notifications_round_recipient_idx
  ON round_notifications (round_id, recipient_email);

-- RLS: round creator can read history of their own round; only service role inserts.
ALTER TABLE round_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "round_notifications_creator_read"
  ON round_notifications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM rounds r
      WHERE r.id = round_notifications.round_id
        AND r.creator_id = auth.uid()
    )
  );
