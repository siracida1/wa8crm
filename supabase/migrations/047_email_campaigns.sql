-- ============================================================
-- 047_email_campaigns.sql — Email Marketing module (EMKT Zittex merge)
--
-- Fourth piece: campaigns (send a template to a list of recipients from
-- a sender) and their per-recipient send logs. Mirrors the old
-- `Campaign` / `CampaignLog` types.
--
-- `sender_id` / `template_id` are ON DELETE SET NULL, not CASCADE —
-- deleting a sender or template later shouldn't erase campaign history,
-- it should just orphan the reference (same reasoning as
-- `api_keys.created_by` in 026).
--
-- RLS tier matches templates/lists (operational content, agent+).
--
-- Idempotent — safe to run multiple times.
-- ============================================================

CREATE TABLE IF NOT EXISTS email_campaigns (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name             text NOT NULL,
  sender_id        uuid REFERENCES email_senders(id) ON DELETE SET NULL,
  template_id      uuid REFERENCES email_templates(id) ON DELETE SET NULL,
  status           text NOT NULL DEFAULT 'sending'
    CHECK (status IN ('sending', 'completed', 'failed')),
  total_recipients integer NOT NULL DEFAULT 0,
  sent_count       integer NOT NULL DEFAULT 0,
  failed_count     integer NOT NULL DEFAULT 0,
  send_delay_ms    integer NOT NULL DEFAULT 1000,
  max_retries      integer NOT NULL DEFAULT 1,
  created_at       timestamptz NOT NULL DEFAULT now(),
  completed_at     timestamptz
);

CREATE INDEX IF NOT EXISTS email_campaigns_account_id_idx ON email_campaigns (account_id);

CREATE TABLE IF NOT EXISTS email_campaign_logs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id    uuid NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
  account_id     uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  recipient      text NOT NULL,
  recipient_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  subject        text NOT NULL,
  status         text NOT NULL CHECK (status IN ('sent', 'failed')),
  message_id     text,
  error          text,
  attempt        integer NOT NULL DEFAULT 1,
  sent_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_campaign_logs_campaign_id_idx ON email_campaign_logs (campaign_id);

ALTER TABLE email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_campaign_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_campaigns_select ON email_campaigns;
CREATE POLICY email_campaigns_select ON email_campaigns FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS email_campaigns_insert ON email_campaigns;
CREATE POLICY email_campaigns_insert ON email_campaigns FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS email_campaigns_update ON email_campaigns;
CREATE POLICY email_campaigns_update ON email_campaigns FOR UPDATE
  USING (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS email_campaigns_delete ON email_campaigns;
CREATE POLICY email_campaigns_delete ON email_campaigns FOR DELETE
  USING (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS email_campaign_logs_select ON email_campaign_logs;
CREATE POLICY email_campaign_logs_select ON email_campaign_logs FOR SELECT
  USING (is_account_member(account_id));
