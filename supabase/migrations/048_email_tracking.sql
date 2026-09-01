-- ============================================================
-- 048_email_tracking.sql — Email Marketing module (EMKT Zittex merge)
--
-- Open/click tracking. `email_campaign_logs` becomes the single send
-- ledger for BOTH campaign sends and sequence (automation) sends —
-- `campaign_id` goes nullable and a new `automation_id` sits beside it,
-- exactly one of the two set depending on origin. Each row also gets a
-- `list_id` (which recipient list the send targeted, when known) so
-- new `email_opened` / `email_clicked` automation triggers can be
-- scoped to "this list" the same way `email_list_joined` already is.
--
-- `status` gains a third value, 'pending': both send paths now insert
-- the log row BEFORE calling the SMTP transport (so the row's id
-- exists to embed in the tracking pixel / link-wrapper URLs), then
-- flip it to 'sent' or 'failed' after the attempt.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

ALTER TABLE email_campaign_logs ALTER COLUMN campaign_id DROP NOT NULL;

ALTER TABLE email_campaign_logs
  ADD COLUMN IF NOT EXISTS automation_id uuid REFERENCES automations(id) ON DELETE SET NULL;
ALTER TABLE email_campaign_logs
  ADD COLUMN IF NOT EXISTS list_id uuid REFERENCES email_lists(id) ON DELETE SET NULL;
ALTER TABLE email_campaign_logs
  ADD COLUMN IF NOT EXISTS opened_at timestamptz;
ALTER TABLE email_campaign_logs
  ADD COLUMN IF NOT EXISTS open_count integer NOT NULL DEFAULT 0;
ALTER TABLE email_campaign_logs
  ADD COLUMN IF NOT EXISTS clicked_at timestamptz;
ALTER TABLE email_campaign_logs
  ADD COLUMN IF NOT EXISTS click_count integer NOT NULL DEFAULT 0;

ALTER TABLE email_campaign_logs DROP CONSTRAINT IF EXISTS email_campaign_logs_status_check;
ALTER TABLE email_campaign_logs
  ADD CONSTRAINT email_campaign_logs_status_check CHECK (status IN ('pending', 'sent', 'failed'));

CREATE INDEX IF NOT EXISTS email_campaign_logs_automation_id_idx ON email_campaign_logs (automation_id);
CREATE INDEX IF NOT EXISTS email_campaign_logs_list_id_idx ON email_campaign_logs (list_id);
