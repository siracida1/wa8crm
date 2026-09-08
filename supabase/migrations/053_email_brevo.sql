-- ============================================================
-- 053_email_brevo.sql — Email Marketing module
--
-- Adds Brevo (ex-Sendinblue) as an alternative sending provider to
-- direct SMTP. A sender row is now either provider='smtp' (existing
-- host/port/smtp_user/smtp_password) or provider='brevo' (only
-- brevo_api_key needed — Brevo handles SPF/DKIM/IP reputation on its
-- side, free tier = 300 emails/día).
--
-- Idempotent — safe to re-run.
-- ============================================================

ALTER TABLE email_senders
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'smtp';
ALTER TABLE email_senders
  ADD COLUMN IF NOT EXISTS brevo_api_key text;

ALTER TABLE email_senders ALTER COLUMN host DROP NOT NULL;
ALTER TABLE email_senders ALTER COLUMN smtp_user DROP NOT NULL;
ALTER TABLE email_senders ALTER COLUMN smtp_password DROP NOT NULL;

ALTER TABLE email_senders DROP CONSTRAINT IF EXISTS email_senders_provider_check;
ALTER TABLE email_senders
  ADD CONSTRAINT email_senders_provider_check CHECK (provider IN ('smtp', 'brevo'));

ALTER TABLE email_senders DROP CONSTRAINT IF EXISTS email_senders_provider_fields_check;
ALTER TABLE email_senders
  ADD CONSTRAINT email_senders_provider_fields_check CHECK (
    (provider = 'smtp' AND host IS NOT NULL AND smtp_user IS NOT NULL AND smtp_password IS NOT NULL)
    OR
    (provider = 'brevo' AND brevo_api_key IS NOT NULL)
  );
