# WhatsApp Onboarding — Progress Log

Running log. One branch, local commits only; nothing applied to production,
nothing pushed, no real message sent.

**Branch:** `feat/whatsapp-onboarding` (from `chore/clean-stack` @ `626d3c6`)
**Started:** 2026-10-13

## Rules in force

- No migration applied to production, no production data touched, no real
  message sent, no charges incurred, no push, no deploy — without explicit
  written approval in chat.
- No invented credentials, approval status, pricing, API behaviour, or test
  results. Unknown is recorded as `UNVERIFIED`.
- No provider token, service-role key, or secret in the browser, logs, or
  error messages.
- Live sending stays off by default: `MESSAGING_LIVE_SEND=false`. The real
  transport throws unless that is `true`. Tests use the mock adapter only.
- Stop at every GATE and wait.

## Log

### Phase 0 — Inspect

- Branch created; working tree clean apart from the untracked `opencode`
  harness artifact, which was left alone. No stash existed.
- Read: `README.md`, `docs/PRODUCT_COMPLETION_AUDIT.md`,
  `docs/IMPLEMENTATION_STATUS.md`, `src/lib/messaging.server.ts`,
  `src/routes/_authenticated/agency/whatsapp.tsx`,
  `src/lib/access.functions.ts`, `src/lib/notifications.functions.ts`,
  `src/integrations/supabase/{client.server.ts,cron-auth.ts,client.ts}`,
  `src/routes/api/cron/property-checkins.ts`, migrations 0000/0003/0006/0008.
- Confirmed no CLAUDE.md or AGENTS.md exists in the repo.
- Verified Meta docs against the live site on 2026-10-13 (not memory):
  Embedded Signup, Coexistence, webhook endpoint + signature, pricing,
  Tech Provider onboarding, opt-in.
- Written: `docs/whatsapp/00-gap-analysis.md`.

### Findings that shaped the analysis

- Live records: `whatsapp_configs` + a 4-value `whatsapp_connection_status`
  enum; no connection, credential, webhook, contact, usage, limit, support or
  support-grant table.
- **Embedded Signup v2 is deprecated 2026-10-15 — two days after the date of this
analysis. This is urgent, not a future migration.** New work must target **v4**.
  inspection date. Any new implementation should target v4. Recorded as a
  Phase 2 prerequisite, not as a reason to stop.
- **WABAs originally created via the developer app cannot be onboarded
  through Embedded Signup.** This is the single fact that most constrains the
  "eligible existing WhatsApp Business numbers" requirement.
- **Consolidated billing does not exist for Tech Providers.** Clients must add
  their own card. Only a Solution Partner can share a credit line.
- Signature scheme confirmed: `X-Hub-Signature-256: sha256=<HMAC-SHA256>` keyed
  on the **app secret**, raw payload. Retries for 7 days; dedup is our job.

### Open questions for GATE 0

1. Tech Provider or Solution Partner? (determines billing and lead time)
2. Is the `whatsapp_configs.connection_status` column derived or dropped once
   `whatsapp_connections` exists?
3. Coexistence (existing WhatsApp Business app numbers) in scope for v1, or
   Cloud API new numbers only? Coexistence needs history sync inside 24h.
