-- ============================================================
-- 054_subaccounts.sql — agency -> subaccounts, multi-account
--                       membership and active-account switching
--
-- Goal
--   One platform owner (super admin) manages "agency" accounts and their
--   subaccounts. A user can belong to several accounts and switch the
--   account they are working in (like GoHighLevel's location switcher).
--
-- Design (why it is low-risk)
--   Every RLS policy and ~116 code paths already resolve tenancy through
--   `profiles.account_id` / `profiles.account_role` (see is_account_member
--   in 017). We keep that as the *active account* and add:
--     * accounts.parent_account_id          — agency hierarchy
--     * platform_admins                     — super admins (no client access)
--     * account_memberships                 — a user may belong to many accounts
--     * resolve_account_access()            — role a caller has in an account
--                                             (membership, agency inheritance,
--                                             or super admin)
--     * list_my_accounts() / switch_account()
--     * create_subaccount() / set_account_membership() /
--       remove_account_membership()
--   Existing policies and RPCs are NOT modified. The only change to an
--   existing structure is the "one account per owner" unique index, which
--   becomes "one ROOT account per owner" so an agency owner can also own
--   subaccounts.
--
-- Role inheritance (agency membership -> child subaccounts)
--   owner/admin of the agency -> admin in every child
--   agent  of the agency      -> agent in every child
--   viewer of the agency      -> viewer in every child
--   super admin               -> owner everywhere
--
-- Known limitation (documented, handled in the UI later)
--   The legacy RPCs set_member_role / remove_account_member (018) act on
--   `profiles`, i.e. only on a user's ACTIVE account. For a user whose
--   active account is a different one, use set_account_membership /
--   remove_account_membership below.
--
-- Idempotent: safe to run more than once. Additive and reversible.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Agency hierarchy
-- ------------------------------------------------------------
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS parent_account_id UUID
    REFERENCES accounts(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_accounts_parent ON accounts(parent_account_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'accounts_no_self_parent'
  ) THEN
    ALTER TABLE accounts
      ADD CONSTRAINT accounts_no_self_parent
      CHECK (parent_account_id IS NULL OR parent_account_id <> id);
  END IF;
END $$;

-- "One account per owner" -> "one ROOT account per owner".
DROP INDEX IF EXISTS idx_accounts_one_per_owner;
CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_one_root_per_owner
  ON accounts(owner_user_id) WHERE parent_account_id IS NULL;

-- ------------------------------------------------------------
-- 2. Platform super admins
--    RLS enabled with NO policies: authenticated clients cannot read or
--    write it. Only SECURITY DEFINER functions and service_role can.
--    Add a super admin from the SQL editor:
--      INSERT INTO platform_admins(user_id)
--      SELECT id FROM auth.users WHERE email = 'info@zittex.com';
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform_admins (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 3. Memberships (a user may belong to many accounts)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS account_memberships (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id)   ON DELETE CASCADE,
  role       account_role_enum NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, account_id)
);
CREATE INDEX IF NOT EXISTS idx_account_memberships_account
  ON account_memberships(account_id);

ALTER TABLE account_memberships ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS account_memberships_select ON account_memberships;
CREATE POLICY account_memberships_select ON account_memberships
  FOR SELECT USING (user_id = auth.uid());
-- No INSERT/UPDATE/DELETE policies: writes go through the DEFINER RPCs.

-- Backfill from the current (single) membership of every user.
INSERT INTO account_memberships (user_id, account_id, role)
SELECT p.user_id, p.account_id, p.account_role
FROM profiles p
WHERE p.account_id IS NOT NULL AND p.account_role IS NOT NULL
ON CONFLICT (user_id, account_id) DO NOTHING;

-- Keep memberships in sync with the legacy flows (signup trigger,
-- invitation redeem, set_member_role, remove_account_member) that write
-- profiles.account_id / account_role. switch_account() sets a
-- transaction-local flag so a plain switch does NOT touch memberships.
CREATE OR REPLACE FUNCTION public.sync_account_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('app.skip_membership_sync', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.account_id IS NOT NULL
     AND OLD.account_id IS DISTINCT FROM NEW.account_id THEN
    -- The legacy flows MOVE a user between accounts: drop the old one.
    DELETE FROM account_memberships
    WHERE user_id = NEW.user_id AND account_id = OLD.account_id;
  END IF;

  IF NEW.account_id IS NOT NULL AND NEW.account_role IS NOT NULL THEN
    INSERT INTO account_memberships (user_id, account_id, role)
    VALUES (NEW.user_id, NEW.account_id, NEW.account_role)
    ON CONFLICT (user_id, account_id) DO UPDATE SET role = EXCLUDED.role;
  END IF;

  RETURN NEW;
END;
$$;
ALTER FUNCTION public.sync_account_membership() OWNER TO postgres;

DROP TRIGGER IF EXISTS profiles_sync_membership ON profiles;
CREATE TRIGGER profiles_sync_membership
  AFTER INSERT OR UPDATE OF account_id, account_role ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_account_membership();

-- ------------------------------------------------------------
-- 4. Access resolution
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_account_access(target_account_id UUID)
RETURNS account_role_enum
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role   account_role_enum;
  v_parent UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid()) THEN
    RETURN 'owner';
  END IF;

  SELECT m.role INTO v_role
  FROM account_memberships m
  WHERE m.user_id = auth.uid() AND m.account_id = target_account_id;
  IF v_role IS NOT NULL THEN
    RETURN v_role;
  END IF;

  SELECT a.parent_account_id INTO v_parent
  FROM accounts a WHERE a.id = target_account_id;
  IF v_parent IS NOT NULL THEN
    SELECT m.role INTO v_role
    FROM account_memberships m
    WHERE m.user_id = auth.uid() AND m.account_id = v_parent;
    IF v_role IN ('owner', 'admin') THEN
      RETURN 'admin';
    ELSIF v_role = 'agent' THEN
      RETURN 'agent';
    ELSIF v_role = 'viewer' THEN
      RETURN 'viewer';
    END IF;
  END IF;

  RETURN NULL;
END;
$$;
ALTER FUNCTION public.resolve_account_access(UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.resolve_account_access(UUID)
  TO authenticated, service_role;

-- ------------------------------------------------------------
-- 5. List + switch the active account
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_my_accounts()
RETURNS TABLE (
  id                UUID,
  name              TEXT,
  parent_account_id UUID,
  role              account_role_enum,
  is_active         BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id,
         a.name,
         a.parent_account_id,
         public.resolve_account_access(a.id) AS role,
         (a.id = (SELECT p.account_id FROM profiles p WHERE p.user_id = auth.uid())) AS is_active
  FROM accounts a
  WHERE auth.uid() IS NOT NULL
    AND public.resolve_account_access(a.id) IS NOT NULL
  ORDER BY (a.parent_account_id IS NOT NULL), a.name;
$$;
ALTER FUNCTION public.list_my_accounts() OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.list_my_accounts() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.switch_account(target_account_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role account_role_enum;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  v_role := public.resolve_account_access(target_account_id);
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'no access to this account' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.skip_membership_sync', 'on', true);
  UPDATE profiles
     SET account_id = target_account_id,
         account_role = v_role
   WHERE user_id = auth.uid();
END;
$$;
ALTER FUNCTION public.switch_account(UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.switch_account(UUID) TO authenticated;

-- ------------------------------------------------------------
-- 6. Subaccount + membership management
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_subaccount(
  subaccount_name TEXT,
  parent_id       UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new    UUID;
  v_access account_role_enum;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;
  IF subaccount_name IS NULL OR btrim(subaccount_name) = '' THEN
    RAISE EXCEPTION 'name required' USING ERRCODE = '22023';
  END IF;

  v_access := public.resolve_account_access(parent_id);
  IF v_access IS NULL OR v_access NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'only agency owner/admin can create subaccounts'
      USING ERRCODE = '42501';
  END IF;

  -- Subaccounts hang directly under a root agency (no nesting).
  IF EXISTS (SELECT 1 FROM accounts WHERE id = parent_id AND parent_account_id IS NOT NULL) THEN
    RAISE EXCEPTION 'subaccounts cannot have subaccounts' USING ERRCODE = '22023';
  END IF;

  INSERT INTO accounts (name, owner_user_id, parent_account_id)
  VALUES (btrim(subaccount_name), auth.uid(), parent_id)
  RETURNING id INTO v_new;

  RETURN v_new;
END;
$$;
ALTER FUNCTION public.create_subaccount(TEXT, UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.create_subaccount(TEXT, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_account_membership(
  target_user_id    UUID,
  target_account_id UUID,
  new_role          account_role_enum
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_access account_role_enum;
BEGIN
  IF new_role = 'owner' THEN
    RAISE EXCEPTION 'use transfer_account_ownership for owner' USING ERRCODE = '22023';
  END IF;

  v_access := public.resolve_account_access(target_account_id);
  IF v_access IS NULL OR v_access NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'admin access required' USING ERRCODE = '42501';
  END IF;

  -- Never demote the account owner through this path.
  IF EXISTS (SELECT 1 FROM accounts WHERE id = target_account_id AND owner_user_id = target_user_id) THEN
    RAISE EXCEPTION 'cannot change the owner role' USING ERRCODE = '22023';
  END IF;

  INSERT INTO account_memberships (user_id, account_id, role)
  VALUES (target_user_id, target_account_id, new_role)
  ON CONFLICT (user_id, account_id) DO UPDATE SET role = EXCLUDED.role;

  -- If that account is the user's active one, keep profiles aligned.
  PERFORM set_config('app.skip_membership_sync', 'on', true);
  UPDATE profiles
     SET account_role = new_role
   WHERE user_id = target_user_id AND account_id = target_account_id;
END;
$$;
ALTER FUNCTION public.set_account_membership(UUID, UUID, account_role_enum) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.set_account_membership(UUID, UUID, account_role_enum) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_account_membership(
  target_user_id    UUID,
  target_account_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_access account_role_enum;
  v_home   UUID;
BEGIN
  v_access := public.resolve_account_access(target_account_id);
  IF v_access IS NULL OR v_access NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'admin access required' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (SELECT 1 FROM accounts WHERE id = target_account_id AND owner_user_id = target_user_id) THEN
    RAISE EXCEPTION 'cannot remove the account owner' USING ERRCODE = '22023';
  END IF;

  DELETE FROM account_memberships
   WHERE user_id = target_user_id AND account_id = target_account_id;

  -- If it was their active account, send them back to another membership
  -- (their own root account first). profiles.account_* are NOT NULL.
  SELECT m.account_id INTO v_home
  FROM account_memberships m
  JOIN accounts a ON a.id = m.account_id
  WHERE m.user_id = target_user_id
  ORDER BY (a.owner_user_id = target_user_id) DESC, m.created_at
  LIMIT 1;

  IF v_home IS NOT NULL THEN
    PERFORM set_config('app.skip_membership_sync', 'on', true);
    UPDATE profiles p
       SET account_id = v_home,
           account_role = (SELECT m.role FROM account_memberships m
                           WHERE m.user_id = target_user_id AND m.account_id = v_home)
     WHERE p.user_id = target_user_id AND p.account_id = target_account_id;
  END IF;
END;
$$;
ALTER FUNCTION public.remove_account_membership(UUID, UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.remove_account_membership(UUID, UUID) TO authenticated;

-- ------------------------------------------------------------
-- Rollback (manual), in this order:
--   DROP FUNCTION public.remove_account_membership(UUID, UUID);
--   DROP FUNCTION public.set_account_membership(UUID, UUID, account_role_enum);
--   DROP FUNCTION public.create_subaccount(TEXT, UUID);
--   DROP FUNCTION public.switch_account(UUID);
--   DROP FUNCTION public.list_my_accounts();
--   DROP FUNCTION public.resolve_account_access(UUID);
--   DROP TRIGGER profiles_sync_membership ON profiles;
--   DROP FUNCTION public.sync_account_membership();
--   DROP TABLE account_memberships; DROP TABLE platform_admins;
--   DROP INDEX idx_accounts_one_root_per_owner;
--   CREATE UNIQUE INDEX idx_accounts_one_per_owner ON accounts(owner_user_id);
--   ALTER TABLE accounts DROP COLUMN parent_account_id;
-- ------------------------------------------------------------
