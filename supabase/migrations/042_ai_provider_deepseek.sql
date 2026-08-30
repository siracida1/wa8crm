-- ============================================================
-- 042_ai_provider_deepseek.sql — allow 'deepseek' in ai_configs.provider
--
-- 029_ai_reply.sql locked the column to CHECK (provider IN ('openai',
-- 'anthropic')). DeepSeek's Chat Completions API is wire-compatible
-- with OpenAI's (src/lib/ai/providers/deepseek.ts reuses the OpenAI
-- adapter against a different base URL), so the application layer
-- already accepts it — this just widens the constraint to match.
--
-- Idempotent: DROP CONSTRAINT IF EXISTS + re-add.
-- ============================================================

ALTER TABLE ai_configs DROP CONSTRAINT IF EXISTS ai_configs_provider_check;

ALTER TABLE ai_configs
  ADD CONSTRAINT ai_configs_provider_check
  CHECK (provider IN ('openai', 'anthropic', 'deepseek'));
