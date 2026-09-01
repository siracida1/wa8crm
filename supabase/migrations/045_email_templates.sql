-- ============================================================
-- 045_email_templates.sql — Email Marketing module (EMKT Zittex merge)
--
-- Second table of the module: reusable HTML email templates. Mirrors
-- the `EmailTemplate` type from the old EMKT Zittex app (name, subject,
-- htmlContent), now account-scoped instead of a shared JSON blob.
--
-- RLS: content, not a credential — any member can read, agent+ can
-- write (matches the `automations` policy tier in 017, not the
-- admin-only `email_senders` tier from 044).
--
-- Idempotent — safe to run multiple times.
-- ============================================================

CREATE TABLE IF NOT EXISTS email_templates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name         text NOT NULL,
  subject      text NOT NULL,
  html_content text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_templates_account_id_idx ON email_templates (account_id);

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_templates_select ON email_templates;
CREATE POLICY email_templates_select ON email_templates FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS email_templates_insert ON email_templates;
CREATE POLICY email_templates_insert ON email_templates FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS email_templates_update ON email_templates;
CREATE POLICY email_templates_update ON email_templates FOR UPDATE
  USING (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS email_templates_delete ON email_templates;
CREATE POLICY email_templates_delete ON email_templates FOR DELETE
  USING (is_account_member(account_id, 'agent'));
