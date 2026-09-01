-- ============================================================
-- 049_email_inbox.sql — Email Marketing module (EMKT Zittex merge)
--
-- Bidirectional inbox. `email_senders` gains an optional IMAP config
-- (separate host/port from the SMTP fields — Gmail alone uses
-- smtp.gmail.com:587 for sending and imap.gmail.com:993 for
-- receiving, two different hosts) plus a watermark (`imap_last_uid`)
-- so the poller only fetches messages newer than the last run.
--
-- `email_inbox_messages` holds one row per received message.
-- `thread_key` groups a back-and-forth into one conversation without
-- full References-header threading: normalized subject + the other
-- party's address, scoped to the mailbox. Good enough for a first
-- cut; a future pass could switch to Message-ID/In-Reply-To chains.
--
-- RLS mirrors email_templates (content, agent+ writes) — reads for
-- any member, and the only writer is the service-role poller/reply
-- routes, so no INSERT/UPDATE policy is needed for authenticated users
-- beyond marking a thread read (agent+).
--
-- Idempotent — safe to run multiple times.
-- ============================================================

ALTER TABLE email_senders ADD COLUMN IF NOT EXISTS imap_host text;
ALTER TABLE email_senders ADD COLUMN IF NOT EXISTS imap_port integer;
ALTER TABLE email_senders ADD COLUMN IF NOT EXISTS imap_user text;
ALTER TABLE email_senders ADD COLUMN IF NOT EXISTS imap_password text;
ALTER TABLE email_senders ADD COLUMN IF NOT EXISTS imap_last_uid integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS email_inbox_messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  sender_id    uuid NOT NULL REFERENCES email_senders(id) ON DELETE CASCADE,
  uid          integer NOT NULL,
  thread_key   text NOT NULL,
  message_id   text,
  in_reply_to  text,
  from_email   text NOT NULL,
  from_name    text,
  to_email     text,
  subject      text,
  body_text    text,
  body_html    text,
  direction    text NOT NULL DEFAULT 'inbound' CHECK (direction IN ('inbound', 'outbound')),
  is_read      boolean NOT NULL DEFAULT false,
  received_at  timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS email_inbox_messages_sender_uid_idx
  ON email_inbox_messages (sender_id, uid);
CREATE INDEX IF NOT EXISTS email_inbox_messages_thread_idx
  ON email_inbox_messages (account_id, thread_key, received_at);
CREATE INDEX IF NOT EXISTS email_inbox_messages_account_idx
  ON email_inbox_messages (account_id, received_at DESC);

ALTER TABLE email_inbox_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_inbox_messages_select ON email_inbox_messages;
CREATE POLICY email_inbox_messages_select ON email_inbox_messages FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS email_inbox_messages_update ON email_inbox_messages;
CREATE POLICY email_inbox_messages_update ON email_inbox_messages FOR UPDATE
  USING (is_account_member(account_id, 'agent'));
