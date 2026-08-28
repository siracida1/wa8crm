-- ============================================================
-- 041_revoke_anon_authenticated_execute.sql — 040 didn't work
--
-- Verified by curling the RPC with the anon key right after 040
-- shipped: still HTTP 200. Every new Supabase project runs
-- `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS
-- TO anon, authenticated, service_role` at provisioning time, which
-- grants EXECUTE to `anon` and `authenticated` directly — not via
-- the PUBLIC pseudo-role. `REVOKE ... FROM PUBLIC` alone never
-- touches that grant, so 040 revoked a privilege nothing was
-- actually relying on and left the real hole open.
--
-- This revokes from the roles that actually held the grant.
-- claim_ai_reply_slot keeps its explicit service_role grant (031).
-- Idempotent — REVOKE is a no-op when the privilege is already gone.
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.claim_ai_reply_slot(uuid, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._bcast_bump(uuid, text, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.broadcast_recipient_aggregate_trigger() FROM anon, authenticated;
