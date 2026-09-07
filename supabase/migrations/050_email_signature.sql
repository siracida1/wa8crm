-- ============================================================
-- 050_email_signature.sql — Email Marketing module (EMKT Zittex merge)
--
-- Per-sender HTML signature (can embed an <img>), appended to every
-- outgoing email from that account (campaigns, sequences, inbox
-- replies). The signature image itself lives in a new `email-media`
-- Storage bucket — mirrors `chat-media` (023) and `flow-media`
-- (016/020): account-scoped writes via the path's first segment
-- (`account-<account_id>/...`), public reads (so the recipient's mail
-- client can fetch it).
--
-- Idempotent — safe to re-run.
-- ============================================================

ALTER TABLE email_senders ADD COLUMN IF NOT EXISTS signature_html text;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'email-media',
  'email-media',
  TRUE,
  5242880, -- 5 MB — plenty for a signature logo/image
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Email media is publicly readable" ON storage.objects;
CREATE POLICY "Email media is publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'email-media');

DROP POLICY IF EXISTS "Members can upload email media" ON storage.objects;
CREATE POLICY "Members can upload email media"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'email-media'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]
    )
  );

DROP POLICY IF EXISTS "Members can update email media" ON storage.objects;
CREATE POLICY "Members can update email media"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'email-media'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]
    )
  );

DROP POLICY IF EXISTS "Members can delete email media" ON storage.objects;
CREATE POLICY "Members can delete email media"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'email-media'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]
    )
  );
