-- ============================================================
-- 043_ai_provider_gemini.sql — allow 'gemini' in ai_configs.provider
--
-- Same reasoning as 042 (DeepSeek): Google's OpenAI-compatibility
-- layer for Gemini (src/lib/ai/providers/gemini.ts) is wire-compatible
-- with the shared OpenAI adapter, so the application layer already
-- accepts it — this just widens the constraint to match.
--
-- Idempotent: DROP CONSTRAINT IF EXISTS + re-add.
-- ============================================================

ALTER TABLE ai_configs DROP CONSTRAINT IF EXISTS ai_configs_provider_check;

ALTER TABLE ai_configs
  ADD CONSTRAINT ai_configs_provider_check
  CHECK (provider IN ('openai', 'anthropic', 'deepseek', 'gemini'));
