-- ============================================================
-- 056_account_social.sql — link each wacrm account to its Postiz user/org
--
-- Social media module (Postiz, post.zittex.com) is multi-tenant by
-- Organization. Every wacrm account (agency or subaccount) maps to ONE
-- Postiz user (who owns that org). wacrm mints the Postiz session for that
-- user after checking the caller's access in wacrm — clients never need a
-- separate Postiz login.
--
-- Server-only: RLS enabled with NO policies, so only the service role
-- (wacrm API routes) can read/write it.
--
-- Additive and idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS account_social (
  account_id     UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  postiz_user_id TEXT NOT NULL,
  postiz_org_id  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE account_social ENABLE ROW LEVEL SECURITY;

-- Link the existing root (agency) account to the existing Postiz admin user
-- (the org that already has Instagram / YouTube connected):
--   INSERT INTO account_social (account_id, postiz_user_id)
--   SELECT id, '<POSTIZ_ADMIN_USER_ID>' FROM accounts
--   WHERE name = 'Mauricio' AND parent_account_id IS NULL
--   ON CONFLICT (account_id) DO NOTHING;

-- Rollback:
--   DROP TABLE account_social;
