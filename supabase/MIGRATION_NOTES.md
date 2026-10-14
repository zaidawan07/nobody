# Database migration safety

These migrations are staged source files only. No database has been changed by this branch.

## Order and prerequisites

The current migration sequence is:

1. `20260924173628_multi_tenant_realestate_foundation.sql` — base schema, roles, tables, RLS policies, and helper functions.
2. `20261014163000_profile_security_hardening.sql` — active-account role helpers, profile/agency column grants, and a single-super-admin invariant.
3. `20261014170000_whatsapp_cloud_api.sql` — server-only token/session/event storage and browser privilege restrictions for WhatsApp.
4. `20261014183000_tenant_relationships_and_rls.sql` — same-agency foreign keys and least-privilege tenant policies.
5. `20261014190000_webhook_worker_recovery.sql` — stale-worker recovery, retry scheduling, and dead-letter metadata.

Before applying any migration:

- Confirm the exact target project and take a restorable backup.
- Run `supabase migration list` against the target and inspect the remote migration history and actual schema.
- If the foundation schema already exists but migration history is missing, reconcile history first. Do not re-run the foundation migration against an existing schema; it creates enums, tables, policies, triggers, and functions without broad idempotency guards.
- Apply the sequence to a disposable database first, then staging. Test a clean install and an upgrade from a representative copy of the current schema.
- The profile hardening migration intentionally aborts if multiple `super_admin` role assignments exist. Resolve duplicates through an approved operational process rather than silently choosing an owner.
- The tenant relationship migration intentionally aborts if it finds cross-agency references in existing data. Inspect and repair those rows explicitly before retrying; do not automatically move customer/property data between agencies.
- Verify the profile/agency status model and the intended roles with test accounts before enabling real users.
- Rehearse recovery/rollback before a production release. Some constraints and privilege changes require a forward-fix or a carefully planned rollback rather than simply deleting migration history.

## WhatsApp Cloud API prerequisites — perform this last

The WhatsApp migration adds server-only token/session/webhook storage and deliberately removes broad browser access to the WhatsApp configuration table. The client must query only the safe columns granted in the migration; it must never request `select("*")` from `whatsapp_configs`.

Only after the core app and staging security tests pass should the operator configure these server secrets: `META_APP_ID`, `META_APP_SECRET`, `META_EMBEDDED_SIGNUP_CONFIG_ID`, `META_GRAPH_API_VERSION`, `META_TOKEN_ENCRYPTION_KEY` (base64-encoded 32-byte key), `META_WEBHOOK_VERIFY_TOKEN`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`. Keep them server-side. The Meta app must be configured for Embedded Signup and the required WhatsApp permissions. Real Meta credentials, app review, webhook delivery, and real-number messaging have not been verified by CI.

The webhook worker must be invoked on a monitored recurring schedule before live webhook events can be processed reliably. The new queue columns allow stale-claim recovery and retry backoff, but the schedule, alerting, and a real provider end-to-end test still need to be configured and verified.

## Bootstrap

The first-owner bootstrap endpoint requires a server-only `PLATFORM_BOOTSTRAP_SECRET`. Configure it in the deployment's secret manager before using `/bootstrap`; never expose it through a `VITE_` variable.

## Approval boundary

Do not merge to `main`, apply any migration to production, or deploy production without explicit approval. Passing CI validates code/build checks, not the live database schema, provider configuration, or production readiness.
