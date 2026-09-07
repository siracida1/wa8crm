-- ============================================================
-- 051_email_campaign_cancel.sql — Email Marketing module
--
-- Adds a 'cancelled' status so a campaign stuck in 'sending' (e.g. the
-- browser tab driving the send loop was closed, or an operator caught
-- a mistake — wrong list, wrong recipient count) can be stopped from
-- ANY tab, not just the one running the loop. /send-one checks this
-- status before every send and refuses once it's 'cancelled', which is
-- the actual kill switch — flipping the DB row alone doesn't stop a
-- loop that's still running client-side.
--
-- Idempotent — safe to re-run.
-- ============================================================

ALTER TABLE email_campaigns DROP CONSTRAINT IF EXISTS email_campaigns_status_check;
ALTER TABLE email_campaigns
  ADD CONSTRAINT email_campaigns_status_check
  CHECK (status IN ('sending', 'completed', 'failed', 'cancelled'));
