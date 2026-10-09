-- ============================================================
-- 055_subaccount_members.sql — list / add members of an account
--                              (companion to 054_subaccounts.sql)
--
-- list_account_members: admins+ of an account (or an agency admin, or a
--   super admin) can see who has an explicit membership in it.
-- add_account_member_by_email: add an EXISTING user (already signed up) to
--   an account with a role. Unknown emails are rejected — new people sign
--   up first, then get added (the legacy invitation flow moves a user
--   between accounts, which conflicts with multi-membership).
--
-- Additive and idempotent.
-- ============================================================

CREATE OR REPLACE FUNCTION public.list_account_members(target_account_id UUID)
RETURNS TABLE (
  user_id   UUID,
  email     TEXT,
  full_name TEXT,
  role      account_role_enum,
  is_owner  BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_access account_role_enum;
BEGIN
  v_access := public.resolve_account_access(target_account_id);
  IF v_access IS NULL OR v_access NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'admin access required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT m.user_id,
         COALESCE(p.email, u.email)::TEXT,
         p.full_name::TEXT,
         m.role,
         (a.owner_user_id = m.user_id)
  FROM account_memberships m
  JOIN accounts a ON a.id = m.account_id
  LEFT JOIN profiles p ON p.user_id = m.user_id
  LEFT JOIN auth.users u ON u.id = m.user_id
  WHERE m.account_id = target_account_id
  ORDER BY (a.owner_user_id = m.user_id) DESC, 2;
END;
$$;
ALTER FUNCTION public.list_account_members(UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.list_account_members(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.add_account_member_by_email(
  target_account_id UUID,
  member_email      TEXT,
  member_role       account_role_enum
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_access account_role_enum;
  v_uid    UUID;
BEGIN
  IF member_role = 'owner' THEN
    RAISE EXCEPTION 'cannot add an owner this way' USING ERRCODE = '22023';
  END IF;

  v_access := public.resolve_account_access(target_account_id);
  IF v_access IS NULL OR v_access NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'admin access required' USING ERRCODE = '42501';
  END IF;

  SELECT u.id INTO v_uid
  FROM auth.users u
  WHERE lower(u.email) = lower(btrim(member_email))
  LIMIT 1;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'user not found: they must sign up first' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (SELECT 1 FROM accounts WHERE id = target_account_id AND owner_user_id = v_uid) THEN
    RAISE EXCEPTION 'that user already owns this account' USING ERRCODE = '22023';
  END IF;

  INSERT INTO account_memberships (user_id, account_id, role)
  VALUES (v_uid, target_account_id, member_role)
  ON CONFLICT (user_id, account_id) DO UPDATE SET role = EXCLUDED.role;

  RETURN v_uid;
END;
$$;
ALTER FUNCTION public.add_account_member_by_email(UUID, TEXT, account_role_enum) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.add_account_member_by_email(UUID, TEXT, account_role_enum) TO authenticated;

-- Rollback:
--   DROP FUNCTION public.add_account_member_by_email(UUID, TEXT, account_role_enum);
--   DROP FUNCTION public.list_account_members(UUID);
