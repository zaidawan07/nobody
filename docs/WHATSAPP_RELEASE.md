# WhatsApp + AI final setup

This guide is intentionally a final release step. No credentials are stored in Git, and no production deployment or database migration is performed by the code changes.

## 1. Configure secrets

Start with `bun run env:check` for the base Supabase settings, then run `bun run env:check -- --whatsapp` and `bun run env:check -- --ai` as you add Meta and OpenAI credentials. The preflight verifies project URL/key consistency and encryption-key format without printing values. Set the app-hosting environment variables from `.env.example`. Keep these server-only:

- `SUPABASE_SERVICE_ROLE_KEY`
- `PLATFORM_BOOTSTRAP_SECRET`
- `META_APP_SECRET`
- `META_TOKEN_ENCRYPTION_KEY`
- `META_WEBHOOK_VERIFY_TOKEN`
- `OPENAI_API_KEY`

Set the same worker-required values in **Supabase Edge Function secrets**:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `META_APP_SECRET`
- `META_TOKEN_ENCRYPTION_KEY`
- `META_GRAPH_API_VERSION`
- `OPENAI_API_KEY`
- `OPENAI_MODEL` (optional; defaults to `gpt-4o-mini`)
- `AI_MAX_REPLIES_PER_AGENCY_PER_DAY` (optional; defaults to `500`)
- `AI_MAX_REPLIES_PER_CONVERSATION_PER_HOUR` (optional; defaults to `20`)

Set `META_APP_ID` and `META_EMBEDDED_SIGNUP_CONFIG_ID` in app hosting. The webhook verify token is used by the webhook function; the app secret verifies `X-Hub-Signature-256`. Use a base64-encoded 32-byte random key for `META_TOKEN_ENCRYPTION_KEY`; do not use a human password.

The worker compares the exact `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` header itself. The gateway JWT check is disabled for that worker endpoint to support both legacy service-role JWTs and new `sb_secret_*` keys. Keep the key in Vault/hosting secrets only; never add it to browser variables or public GitHub secrets/logs.

## 2. Configure Meta

1. Create/configure the Meta app with WhatsApp Cloud API and Embedded Signup.
2. Configure the Meta webhook callback to the deployed `whatsapp-webhook` Edge Function URL and use `META_WEBHOOK_VERIFY_TOKEN`.
3. Subscribe the app to the WhatsApp account's message and status fields.
4. Complete Embedded Signup and register the phone number with the six-digit two-step verification PIN.
5. Test with a non-production number before enabling AI.

## 3. Schedule the durable worker

The webhook function only verifies, routes, and queues events. The worker must be invoked regularly to process inbound messages, delivery statuses, lead creation, and optional AI replies.

In the Supabase SQL editor, ensure the `pg_cron`, `pg_net`, and Vault extensions are enabled. Then run the following once, replacing the URL and secret placeholders. Store the URL and key in Vault rather than embedding them in a recurring SQL job.

```sql
select vault.create_secret(
  'https://YOUR_PROJECT_REF.supabase.co/functions/v1/whatsapp-webhook-worker',
  'whatsapp_worker_url',
  'URL for the authenticated WhatsApp queue worker'
);

select vault.create_secret(
  'YOUR_SUPABASE_SERVICE_ROLE_KEY',
  'whatsapp_worker_authorization',
  'Bearer secret used only to invoke the WhatsApp queue worker'
);

select cron.schedule(
  'whatsapp-webhook-worker-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'whatsapp_worker_url'
      limit 1
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'whatsapp_worker_authorization'
        limit 1
      )
    ),
    body := '{}'::jsonb
  );
  $$
);
```

Before running this, check `cron.job` for an existing job with the same name so you do not schedule duplicates. After scheduling, verify that the job runs every minute and monitor Edge Function logs and queue age. The worker processes a bounded batch and retries failed events with backoff; events that exhaust retries need manual review.

## 4. Verify before enabling AI

- Apply and verify all migrations in a disposable/staging Supabase project first.
- Confirm the webhook receives a signed test event and the worker processes it.
- Test duplicate delivery, worker restart/recovery, opt-out phrases, explicit `START` re-opt-in, human handoff, expired tokens, and the 24-hour service window.
- Verify the daily agency and per-conversation reply limits.
- Confirm a lead is created once and linked to the right conversation.
- Verify AI responses only use the current agency's available property inventory and that failed sends are visible to staff.
- Ensure the agency privacy notice covers sending customer message context to OpenAI for reply generation. The AI toggle must remain off until this disclosure, credentials, worker schedule, and monitoring are all ready.
- Do not enable AI until a human can see and take over a conversation and you have tested with a non-production number.

AI generation uses `store: false` for the OpenAI Chat Completions request. EstateOS still stores inbound and outbound conversation messages in its own database as required for the inbox and audit trail. Template messages, broadcasts, and AI-initiated messages outside the customer-service window remain disabled.
