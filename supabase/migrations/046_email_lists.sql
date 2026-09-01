-- ============================================================
-- 046_email_lists.sql — Email Marketing module (EMKT Zittex merge)
--
-- Third piece: recipient lists imported from CSV. `email_lists` holds
-- the list metadata (mirrors the old `RecipientList` type — name +
-- optional classification/zone/city/country/source file); each row's
-- contacts live in `email_list_recipients`, one row per recipient.
--
-- `data jsonb` holds every mapped CSV column for that recipient
-- (arbitrary, user-defined variable names from the column-mapping
-- step — {{name}}, {{company}}, whatever was mapped), same shape as
-- the old client-side `Recipient` type ({ email, [key]: string }).
-- `email` is pulled out to its own column for indexing/dedup; it's
-- also duplicated inside `data.email` so template rendering can just
-- read every variable from one place.
--
-- RLS tier matches `email_templates` (content, agent+ writes).
--
-- Idempotent — safe to run multiple times.
-- ============================================================

CREATE TABLE IF NOT EXISTS email_lists (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name             text NOT NULL,
  classification   text,
  zone             text,
  city             text,
  country          text,
  source_file_name text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_lists_account_id_idx ON email_lists (account_id);

CREATE TABLE IF NOT EXISTS email_list_recipients (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id    uuid NOT NULL REFERENCES email_lists(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  email      text NOT NULL,
  data       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_list_recipients_list_id_idx ON email_list_recipients (list_id);
CREATE UNIQUE INDEX IF NOT EXISTS email_list_recipients_list_email_idx
  ON email_list_recipients (list_id, lower(email));

ALTER TABLE email_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_list_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_lists_select ON email_lists;
CREATE POLICY email_lists_select ON email_lists FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS email_lists_insert ON email_lists;
CREATE POLICY email_lists_insert ON email_lists FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS email_lists_update ON email_lists;
CREATE POLICY email_lists_update ON email_lists FOR UPDATE
  USING (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS email_lists_delete ON email_lists;
CREATE POLICY email_lists_delete ON email_lists FOR DELETE
  USING (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS email_list_recipients_select ON email_list_recipients;
CREATE POLICY email_list_recipients_select ON email_list_recipients FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS email_list_recipients_insert ON email_list_recipients;
CREATE POLICY email_list_recipients_insert ON email_list_recipients FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS email_list_recipients_delete ON email_list_recipients;
CREATE POLICY email_list_recipients_delete ON email_list_recipients FOR DELETE
  USING (is_account_member(account_id, 'agent'));
