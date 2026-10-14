-- Add crash recovery and bounded retry scheduling to the durable webhook queue.
ALTER TABLE public.whatsapp_webhook_events
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS dead_lettered_at timestamptz;

CREATE INDEX IF NOT EXISTS whatsapp_webhook_events_retry_queue_idx
  ON public.whatsapp_webhook_events (status, next_attempt_at, received_at);

COMMENT ON COLUMN public.whatsapp_webhook_events.locked_at IS
  'Worker claim timestamp; stale processing claims can be safely reclaimed.';
COMMENT ON COLUMN public.whatsapp_webhook_events.next_attempt_at IS
  'Earliest retry time after a transient processing failure.';
COMMENT ON COLUMN public.whatsapp_webhook_events.dead_lettered_at IS
  'Timestamp set when automatic retries are exhausted; manual review/replay is required.';
