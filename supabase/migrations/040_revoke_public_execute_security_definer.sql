-- ============================================================
-- 040_revoke_public_execute_security_definer.sql — close unauthenticated
-- RPC access on internal SECURITY DEFINER functions
--
-- claim_ai_reply_slot (029) and _bcast_bump / broadcast_recipient_
-- aggregate_trigger (005) were created without an explicit REVOKE,
-- so Postgres' default PUBLIC execute grant on newly created
-- functions was still in effect. Confirmed live by Supabase's
-- Security Advisor: anon (no session at all) could call these
-- directly over PostgREST (`/rest/v1/rpc/...`) and, since they are
-- SECURITY DEFINER, bypass RLS to mutate conversations.ai_reply_count
-- or broadcasts.<any_count_column> for ANY account, not just their
-- own.
--
-- Fix: revoke PUBLIC execute. claim_ai_reply_slot already has an
-- explicit grant to service_role (031) which this does not touch.
-- broadcast_recipient_aggregate_trigger is a trigger function only
-- ever invoked by Postgres itself; direct RPC calls to it already
-- fail with "trigger functions can only be called as triggers", but
-- we revoke anyway for defense-in-depth / to clear the advisor flag.
--
-- Idempotent — REVOKE is a no-op when the privilege is already gone.
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.claim_ai_reply_slot(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._bcast_bump(uuid, text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.broadcast_recipient_aggregate_trigger() FROM PUBLIC;
