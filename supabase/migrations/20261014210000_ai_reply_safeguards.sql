-- Bound tenant-configured AI prompts and add a covering index for reply quotas.
-- Limits are enforced in the database as well as in the settings UI.

ALTER TABLE public.whatsapp_configs
  ADD CONSTRAINT whatsapp_configs_ai_greeting_length_check
    CHECK (ai_greeting IS NULL OR char_length(ai_greeting) <= 500),
  ADD CONSTRAINT whatsapp_configs_ai_instructions_length_check
    CHECK (ai_instructions IS NULL OR char_length(ai_instructions) <= 2000),
  ADD CONSTRAINT whatsapp_configs_ai_language_check
    CHECK (ai_language IN ('auto', 'ur', 'en', 'ur-en')),
  ADD CONSTRAINT whatsapp_configs_ai_tone_check
    CHECK (ai_tone IS NULL OR ai_tone IN ('friendly', 'professional', 'concise')),
  ADD CONSTRAINT whatsapp_configs_handoff_keywords_count_check
    CHECK (cardinality(handoff_keywords) <= 20),
  ADD CONSTRAINT whatsapp_configs_handoff_keywords_length_check
    CHECK (NOT EXISTS (
      SELECT 1
      FROM unnest(handoff_keywords) AS keyword
      WHERE char_length(keyword) > 80
    ));

CREATE INDEX IF NOT EXISTS conversation_messages_ai_usage_idx
  ON public.conversation_messages (agency_id, created_at)
  WHERE sender = 'ai';

COMMENT ON COLUMN public.whatsapp_configs.ai_enabled IS
  'AI replies are opt-in and may only be enabled through the server-side readiness check.';
COMMENT ON COLUMN public.whatsapp_configs.ai_instructions IS
  'Agency preferences for AI responses; hard-limited to 2000 characters and subordinate to system safety rules.';
