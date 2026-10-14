# EstateOS

EstateOS is a multi-tenant real-estate operations app for Pakistani property agencies. It brings property inventory, leads, site visits, team access, and a WhatsApp inbox into one agency workspace.

> **Release status:** the application and security work are being prepared in draft PR #1. CI verifies source-level quality; it does not prove a Supabase project is migrated, Meta is configured, or production traffic is safe. Do not deploy until the release checklist is complete.

## What is included

- **Platform owner:** provision agencies and suspend/reactivate agency workspaces.
- **Agency workspace:** inventory, private property photos, leads and budgets in PKR, assignments, site visits, and due-dated follow-up tasks.
- **Team and settings:** agency-admin and employee roles, account status controls, self-service profile settings, and agency contact/service-area settings.
- **Reports and billing:** activity KPIs, spreadsheet-safe CSV exports, configurable subscription plans, usage dashboards, upgrade requests, and database-enforced property/lead/team limits.
- **WhatsApp automation:** Meta Embedded Signup, encrypted server-side access tokens, signed webhook verification, durable event storage, delivery status updates, opt-out/handoff handling, bounded AI replies using agency inventory, automatic lead capture, and a retrying worker.
- **Security:** tenant-scoped database policies, same-agency relationship constraints, profile field restrictions, server-owned messaging state, and automated checks.

AI replies default to off and can only be enabled after server-side OpenAI/Meta configuration and a connected WhatsApp number are verified. Replies use only the current agency's available inventory, enforce opt-out/human-handoff and the 24-hour window, and have configurable daily/per-conversation caps. Approved template sends remain disabled. The webhook worker must be invoked on a schedule and monitored before live ingestion is relied on.

## Subscription and billing status

Starter/Growth/Pro plans, usage limits, upgrade requests, and platform-owner approvals are implemented. Starter is free by default; paid plan prices are intentionally unset until the platform owner configures them. Checkout and payment-provider webhooks remain for the final API integration stage. Do not treat manual plan approval as a verified payment.

## Stack

- React 19, TypeScript, TanStack Start/Router, Vite
- Supabase Auth, Postgres, Row Level Security, Storage, and Edge Functions
- Bun for dependency installation and unit tests
- Deno for Edge Function type-checking

## Local development

1. Install Bun and a supported Node.js runtime.
2. Copy `.env.example` to `.env` and supply the public Supabase project URL and publishable key for a **non-production** project.
3. Install dependencies with `bun install --frozen-lockfile`.
4. Run `bun run dev`.
5. Before testing real data, verify the migration history and apply the staged migrations only to a disposable/staging Supabase project.

Useful commands:

```sh
bun run lint
bun run typecheck
bun run test
bun run build
bun run secrets:check
bun run env:check
```

Edge Function source checks:

```sh
deno check supabase/functions/whatsapp-webhook/index.ts supabase/functions/whatsapp-webhook-worker/index.ts
```

## Environment variables

Client build-time variables:

- `VITE_SUPABASE_URL` — Supabase project URL.
- `VITE_SUPABASE_PUBLISHABLE_KEY` — Supabase publishable/anon key only.

Server-only variables:

- `SUPABASE_URL` — project URL.
- `SUPABASE_PUBLISHABLE_KEY` — the same public/publishable key used by the browser; never use a secret key here.
- `SUPABASE_SERVICE_ROLE_KEY` — privileged service-role key; **never** prefix it with `VITE_` or expose it to the browser.
- `PLATFORM_BOOTSTRAP_SECRET` — high-entropy one-time platform-owner bootstrap secret.

Meta WhatsApp variables (configure only during the final integration phase):

- `META_APP_ID`
- `META_APP_SECRET`
- `META_EMBEDDED_SIGNUP_CONFIG_ID`
- `META_GRAPH_API_VERSION` (defaults to `v25.0` in the server code)
- `META_TOKEN_ENCRYPTION_KEY` — base64-encoded 32-byte AES-GCM key.
- `META_WEBHOOK_VERIFY_TOKEN` — webhook verification secret.
- `OPENAI_API_KEY` — AI provider key (server-only; configure in both app hosting and Supabase Edge Function secrets).
- `OPENAI_MODEL` — defaults to `gpt-4o-mini`.
- `AI_MAX_REPLIES_PER_AGENCY_PER_DAY` — defaults to `500`.
- `AI_MAX_REPLIES_PER_CONVERSATION_PER_HOUR` — defaults to `20`.

Set server-side secrets in the hosting environment and Edge Function secrets in Supabase. Do not commit real credentials. Before connecting a provider, run `bun run env:check` for the base Supabase configuration, `bun run env:check -- --bootstrap` when preparing first-owner bootstrap, `bun run env:check -- --whatsapp` for Meta setup, or `bun run env:check -- --ai` to validate the full WhatsApp + AI environment. The checker reports variable names and configuration errors only; it never prints secret values. The service-role key, Meta app secret, encryption key, and bootstrap secret must never be sent to the browser.

## Database and storage

Migrations under `supabase/migrations/` are staged source code, not evidence that a database has been updated. Confirm the target database's migration history and schema first. Apply the migrations to a disposable project, test the full flow and inspect any preflight errors before planning a production rollout. The tenant-relationship migration intentionally aborts when it detects cross-agency references.

Property images use private storage and signed access paths. Verify bucket policies, upload/download flows, file-size limits, and retention behavior in staging.

## WhatsApp release checklist

- Configure the Meta app, WhatsApp product, Embedded Signup configuration, permissions, and allowed callback URLs.
- Add the server and Edge Function secrets listed above, including `OPENAI_API_KEY` and the same Meta token-encryption/app-secret values to the worker environment.
- Deploy the webhook and worker functions only after testing against a non-production WhatsApp number.
- Configure a recurring, authenticated worker invocation; alert on failed/dead-lettered events and monitor queue age.
- Test webhook signatures, duplicate delivery, worker retries/crash recovery, inbound messages, delivery statuses, opt-out keywords, and the 24-hour service window.
- Keep AI replies disabled until consent, prompt/data handling, human handoff, safety controls, and end-to-end tests are approved.

## Validation and release

The GitHub Actions workflows run lint, build, TypeScript checks, unit tests, and Deno type-checking. These are necessary but not sufficient. Before launch, also verify authentication and account recovery, RLS across two test agencies, migration rollback/recovery, private photo access, real Meta sandbox behavior, logs/alerts, backups, privacy/retention, and production hosting settings.

Keep PR #1 in draft until its large source-tree restoration and migration plan have been reviewed. No production database migration or deployment is performed by the repository checks.
