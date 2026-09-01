-- ============================================================
-- 044_email_senders.sql — Email Marketing module (EMKT Zittex merge)
--
-- First table of the Email Marketing platform being folded into this
-- app as its own isolated section (see PlatformSwitcher / the /email
-- route group). `email_senders` holds the SMTP sending accounts a
-- campaign can send from — the equivalent of EMKT Zittex's old
-- `EmailAccount` type, now account-scoped and RLS-protected instead
-- of living in a single shared JSON blob.
--
-- Design notes
--   - Account-scoped like every other domain table since 017.
--   - `smtp_password` is stored in plaintext, same effective security
--     bar as the previous single-password-gated JSON blob (protected
--     by RLS + admin-only writes instead of a shared app password).
--     Encrypting at rest is a reasonable follow-up, not a blocker for
--     this first migration.
--   - One default sender per account: enforced in the application
--     layer (unsetting the previous default on write), not a DB
--     constraint — mirrors how `EmailAccount.isDefault` worked before.
--
-- RLS mirrors `api_keys` (026): any member can read (a sender needs
-- to be pickable in the campaign wizard by anyone sending), only
-- admin+ can create/edit/delete (settings-class, holds a credential).
--
-- Idempotent — safe to run multiple times.
-- ============================================================

CREATE TABLE IF NOT EXISTS email_senders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name          text NOT NULL,
  email         text NOT NULL,
  host          text NOT NULL,
  port          integer NOT NULL DEFAULT 587,
  smtp_user     text NOT NULL,
  smtp_password text NOT NULL,
  is_default    boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_senders_account_id_idx ON email_senders (account_id);

ALTER TABLE email_senders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_senders_select ON email_senders;
CREATE POLICY email_senders_select ON email_senders FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS email_senders_insert ON email_senders;
CREATE POLICY email_senders_insert ON email_senders FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS email_senders_update ON email_senders;
CREATE POLICY email_senders_update ON email_senders FOR UPDATE
  USING (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS email_senders_delete ON email_senders;
CREATE POLICY email_senders_delete ON email_senders FOR DELETE
  USING (is_account_member(account_id, 'admin'));
