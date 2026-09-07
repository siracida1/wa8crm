-- ============================================================
-- 052_email_unsubscribe.sql — Email Marketing module
--
-- Opt-out list. Every outgoing email (campaigns + sequences) now
-- carries an unsubscribe link by default; clicking it inserts one row
-- here and every future send checks this table before contacting the
-- recipient again. account-scoped, not list-scoped — an unsubscribe
-- applies everywhere in the account, not just the list that triggered
-- the send that carried the link.
--
-- Idempotent — safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS email_unsubscribes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  email           text NOT NULL,
  unsubscribed_at timestamptz NOT NULL DEFAULT now()
);

-- Plain column-list unique index (not an expression index on lower())
-- so PostgREST's on_conflict=account_id,email upsert can resolve it.
-- Callers normalize `email` to lowercase before writing here.
CREATE UNIQUE INDEX IF NOT EXISTS email_unsubscribes_account_email_idx
  ON email_unsubscribes (account_id, email);

ALTER TABLE email_unsubscribes ENABLE ROW LEVEL SECURITY;

-- Reads for account members (so the Cuentas/Campañas UI can show who
-- opted out); writes are service-role only (the public unsubscribe
-- link route), no INSERT/UPDATE/DELETE policy for authenticated users.
DROP POLICY IF EXISTS email_unsubscribes_select ON email_unsubscribes;
CREATE POLICY email_unsubscribes_select ON email_unsubscribes FOR SELECT
  USING (is_account_member(account_id));
