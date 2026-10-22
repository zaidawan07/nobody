# EstateOS current pilot status

**Checked:** 2026-10-20  
**Worktree:** `feature/pre-whatsapp` at `8b37287`  
**Authority:** This file records the current local worktree and checks. Older status reports below it are historical snapshots, not proof of the current live database or deployment.

## What is implemented locally

- Multi-tenant property and lead CRM with role-scoped access, property media, lead activity history, and follow-up records.
- WhatsApp Business App coexistence onboarding through Meta Embedded Signup. A customer must authorize an eligible existing number in Meta; typing a phone number alone cannot grant API access.
- Agency WhatsApp inbox, signed Meta webhook, inbound and delivery-status handling, encrypted provider-token storage, contact opt-in/opt-out, manual replies, AI-assisted replies, human handoff, and scheduled text/template follow-ups.
- WhatsApp live sending is disabled by default. AI answers use current available listing facts and configured agency instructions; failures pause automation for a human.
- Free-plan fallback and migrations `0014`–`0024` are present locally. Migration `0022` adds idempotent monthly WhatsApp/AI usage reservations; migration `0023` makes invitation revocation and pending-role removal atomic; migration `0024` pins the property-status trigger's `search_path`. These later migrations have not been reconciled/applied to Supabase.

## Checks run against this worktree

### Additional verification on 2026-10-20

- `npm run test:unit` — PASS, 9 tests including error-log redaction regression cases.
- `npm run test:safety` — PASS, 17 tests.
- `node test/run-tests.mjs` — PASS, 192 SQL/security sections and 32 expected-error guards.
- `node_modules/.bin/tsc.cmd --noEmit` — PASS.
- `npm run lint` — PASS, zero errors and four existing React Fast Refresh warnings.
- `git diff --check` — PASS; Git reported only LF/CRLF conversion warnings.
- `npm run build` using an isolated `ESTATEOS_NITRO_OUTPUT_DIR` — PASS. The default `.output` target could not be cleared because OneDrive's reparse-point directories returned Windows `EPERM`; no existing generated output was removed.
- `node scripts/check-client-bundle.mjs` with the isolated build output — PASS, 87 assets scanned; no server-only client, key name, or secret value found.

- `node_modules\\.bin\\tsc.cmd --noEmit` — exit 0 after the lead/visit form typing cleanup.
- `npm run lint` — exit 0, 0 errors and 4 existing React Fast Refresh warnings in shared UI components.
- Focused ESLint on the WhatsApp screens, usage pages, usage query, send function, webhook, and follow-up cron — exit 0.
- Focused ESLint on WhatsApp webhook, send functions, and follow-up cron — exit 0.
- Focused ESLint on the follow-up cron, bounded-retry helper, and retry tests — exit 0.
- `npm run build` for the default Cloudflare module preset — exit 0 on 2026-10-20; Worker output generated with compatibility date `2026-10-19` (non-fatal Vite/Nitro plugin notices).
- `npm run preview` using Wrangler — local Worker started; `GET /` and `GET /api/health` both returned HTTP 200 on 2026-10-20. Preview process was stopped afterward.
- `scripts/check-client-bundle.mjs` against the latest build — scanned 87 client assets; no server-only code, key name, or secret value found.
- `node test/run-tests.mjs` — 192 sections; 32 expected-error guards; all statements matched expected behavior (re-run 2026-10-20). This run replays local migrations `0017`–`0024` and includes WhatsApp security, usage metering, invitation lifecycle, and function-search-path regression tests.
- `npm run test:safety` — 17 migration-runner/environment-preflight/messaging-contract tests passed (re-run 2026-10-20); Supabase writes require a single migration, exact project-ref confirmation, schema-reconciliation acknowledgement, and explicit write approval.
- `npm run test:unit` — 7 WhatsApp retry/opt-out tests passed (re-run 2026-10-20).
- `npm run check:pilot-env` — base app/database configuration ready; Meta, AI, cron, and email remain pending; automated/live sending is confirmed disabled. No secret values are printed. No database or provider requests were made.
- `node_modules/.bin/tsx test/whatsapp-followup-retry.test.ts` — 2 retry-policy cases passed.
- `node_modules/.bin/tsc --noEmit` — exit 0 after the follow-up retry change.
- `node node_modules/tsx/dist/cli.mjs test/pkr-parser.test.ts` — all 20 parser cases passed.
- `node --import tsx --test test/whatsapp-meta-events.test.ts` — 2 Meta account-update cases passed (offboarding and unknown-event handling).
- `node --import tsx --test test/whatsapp-followup-retry.test.ts test/whatsapp-meta-events.test.ts` — 4 focused retry and Meta lifecycle tests passed after the latest typing/formatting edits.
- `git diff --check` — exit 0; only Git LF/CRLF conversion warnings were printed.
- Test-only AES-GCM credential encrypt/decrypt round-trip — passed using a non-production test key; no token or key output.
- No live provider delivery, Meta onboarding, browser end-to-end flow, or production Worker request has been verified.

## External gates before a customer pilot

Operational recovery/monitoring procedures are in [PILOT_OPERATIONS_RUNBOOK_2026-10-20.md](./PILOT_OPERATIONS_RUNBOOK_2026-10-20.md); payment and jurisdiction-specific legal gates are tracked in [BILLING_AND_LEGAL_RELEASE_GATES.md](./BILLING_AND_LEGAL_RELEASE_GATES.md). These are procedures/checklists, not evidence that the controls are configured.

0. **Invitation lifecycle hardening (local implementation; migration not applied live).** Invitation acceptance now validates the authenticated user's profile email, agency, pending status, and expiry server-side before password change, then conditionally marks the invite accepted. Resending a pending invite renews the app-side expiry and uses a guarded update so a concurrent revoke/accept cannot be overwritten. Revocation uses migration `0023_atomic_invitation_revocation.sql` to transition the invite and remove the pre-provisioned role in one database transaction. Local test coverage is in `test/14_invitation_lifecycle.sql`; it passed in the current 192-section PGlite run.
1. **Historical credential exposure is partially remediated; verification remains a security blocker.** Git history contains a previously committed `env` file with credential-shaped values for `SUPABASE_SERVICE_ROLE_KEY` and `DATABASE_URL` (values intentionally not displayed). The owner reports both credentials were changed and replacements were kept out of Git. Local checks confirm `.env` is ignored by `.gitignore` and the only tracked env-like file in the checked paths is `.env.example`. Old-value invalidation, updates to every legitimate consumer, access-log review, and repository visibility/history cleanup remain unverified. See `docs/SECURITY_CREDENTIAL_EXPOSURE.md`. No history rewrite, push, or deployment was performed.
2. **Live Supabase schema/migration drift is confirmed (read-only check, 2026-10-20).** The intended project `udkwbmvrhyeltdjogzjy` is accessible and reports `ACTIVE_HEALTHY` on PostgreSQL 17. The live migration ledger contains only `20261011115647 / 0009_lock_down_function_execute`, while the repository contains numbered migrations `0000`–`0024`. The live public schema has 20 RLS-enabled tables, but it does not expose several objects introduced by later local migrations, including `agency_invitations`, `lead_activities`, `lead_followups`, `whatsapp_connections`, and WhatsApp message-event/automation tables. This is not safe to reconcile by blindly applying all missing files: the ledger and actual schema are inconsistent, and some earlier schema changes appear to exist despite missing ledger entries. Do not apply or mark migrations as applied until each local migration is reconciled against the live schema and a reviewed, explicit recovery plan is approved. No live DDL or data changes were made during this inspection.
3. **Deploy to a public HTTPS staging URL** on the intended Cloudflare account; set server-only Supabase and Meta secrets, run health checks, and validate the deployed Worker. No deployment was made in this pass.
4. **Finish Meta setup.** Configure Embedded Signup, Coexistence, the webhook callback and subscribed fields, business verification/app review/required permissions, and an eligible test number. Meta controls whether each customer number is eligible.
5. **Connect OpenAI and the scheduler.** Set the server-side model and API key, keep `WHATSAPP_LIVE_SEND=false` until a test number and approved template are verified, then configure the authenticated one-minute follow-up scheduler.
6. **Run a real pilot smoke test** for connect/disconnect, inbound messages, echo messages from the WhatsApp Business App, AI handoff, STOP, service-window rules, templates, follow-up retries, and delivery receipts.

Server error reporting was hardened: exception messages and nested causes are omitted from logs because they may contain customer input or provider response details. Logs retain the error class, numeric HTTP status, and stack locations. Notification delivery failures no longer include user IDs or database error text. Regression coverage for error descriptions is in `test/error-capture.test.ts`.

## Product limits to plan around

- The local WhatsApp design supports multiple agency-owned numbers through `whatsapp_connections` (migrations `0018`–`0021`), with existing `whatsapp_configs` retained for compatibility. The live Supabase schema currently does not expose `whatsapp_connections`, so multi-number support is not live-ready until schema reconciliation and approved migration work are complete.
- Approved template sends currently support templates with no variable placeholders.
- Payment processing, self-serve billing, public production deployment, customer terms/privacy pages, and operational backup/monitoring setup are not complete or verified here. Treat the product as a staging pilot, not generally available SaaS.

## Current implementation note

Inbound webhook events marked `processing` can now be reclaimed after two minutes when Meta retries the same event. Claiming uses the previous status and timestamp to avoid two retry workers processing the same event at once. Retried message IDs do not increment unread counts twice, and out-of-order provider timestamps cannot move the conversation window backwards. STOP/opt-out handling now fails the webhook event instead of marking it processed if the contact's opted-out state could not be durably saved.

Scheduled follow-ups retry failures that occur before the Meta send request, using one- and two-minute backoff and at most three claimed attempts. Once a provider request starts, an uncertain result goes to manual review instead of being retried automatically, preventing duplicate customer messages.

Meta account-offboarding webhooks now also move connections already marked `attention_required` to `disconnected`; previously the webhook updated only `connected` rows. Unit tests cover offboarding and unknown account-update events. The opt-out handler now refuses to mark a STOP webhook processed until the opted-out state is durably saved. Migration `0024_fix_property_status_guard_search_path.sql` pins the trigger-only property-status guard to `search_path = public`; its regression test checks both the pinned setting and client EXECUTE lockdown. The generated Worker compatibility date is pinned to `2026-10-19` so UTC's next-day date cannot make the local Cloudflare preview reject the build.

### Follow-up work and verification on 2026-10-20

- Added `test/webhook-guards.test.ts` to the standard `test:unit` script. The bounded-body implementation rejects oversized chunked input while streaming and cancels its reader; the regression test passed.
- Expanded `docs/LIVE_SCHEMA_RECONCILIATION_2026-10-20.md` with local SQL object inventory, dependencies, idempotency/data/locking risks, and pre/post checks for every migration `0000`–`0024`. This is not a fresh live schema inspection; the prior dated findings remain historical evidence.
- Added an owner checklist to `docs/SECURITY_CREDENTIAL_EXPOSURE.md` for old-value invalidation, consumer replacement, access-log review, and repository visibility/history decisions. Those external checks remain pending.
- Verification at that point: 15 unit tests passed; 17 safety tests passed; the SQL/security suite passed 192 sections with 32 expected-error guards; TypeScript exited 0; lint exited 0 with four existing Fast Refresh warnings; isolated Cloudflare build passed; bundle guard passed across 87 assets; `git diff --check` exited 0 with line-ending warnings. See the additional focused review below for the latest counts.

### Additional focused review on 2026-10-20

- Meta webhook delivery-status persistence is now scoped to the connection resolved from the signed webhook, rejects unknown status labels, falls back safely for invalid timestamps, stores a generic failure description, and returns a retryable error if persistence fails. Regression coverage includes exact signature verification, malformed/non-object JSON parsing, and the exact 1 MB body boundary.
- `claimSuperAdmin` now removes only the caller's own bootstrap claim if inserting their `super_admin` role fails, so a failed second step does not intentionally strand the one-time seat. A source-contract regression check covers this compensation path.
- Server functions and provider adapters no longer throw raw Supabase/provider response messages to the browser. User-facing flow-specific failures remain; the underlying details are omitted.
- The migration document now labels the live state explicitly **UNRECONCILED**. Its object observations remain historical evidence and were not refreshed through a current supported read-only connector.
- Latest focused checks: 20 unit tests and 20 safety tests passed; SQL/security passed 192 sections with 32 expected-error guards; TypeScript, lint, isolated Cloudflare build, and the 87-asset bundle guard passed. Pilot-env preflight reports base configuration ready, provider integrations pending, and live messaging disabled. No live database or provider was contacted.

### Execution record — 2026-10-20 (this checkout)

The latest focused verification supersedes older counts in this historical file: `npm run test:unit` passed 20/20; `npm run test:safety` passed 23/23; `node test/run-tests.mjs` passed all 192 SQL/security sections with 32 expected-error guards; `node_modules/.bin/tsc.cmd --noEmit` exited 0; `npm run lint` exited 0 with four existing React Fast Refresh warnings; `npm run check:pilot-env` reported base app/database READY, Meta/AI/scheduler/email PENDING, live messaging disabled, and made no database/provider requests; `git diff --check` exited 0 with only LF/CRLF warnings. The staging smoke script was not run because it requires separately configured staging provider/account IDs and creates synthetic staging records.

The local webhook executable and runbook are in `scripts/staging/whatsapp-webhook-smoke.mjs` and `docs/whatsapp/staging/OPERATOR_RUNBOOK.md`. It requires explicit HTTPS host and synthetic-write acknowledgements; it does not make provider sends or enable live sending. Staging setup, connection isolation, actual Meta signup, rate-limit behavior, and provider fault injection remain unverified. The latest supported read-only schema evidence was unavailable in this turn; live schema remains **UNRECONCILED**. No production database/provider was contacted and no migration was applied.

### Further local work — 2026-10-20

- WhatsApp conversations can now be assigned by an agency admin to an active same-agency employee. Employees have a separate inbox and server functions that constrain list/read/reply/unread operations to their own agency and assigned conversations. Assignment sends a generic in-app notification; repeated assignment to the same employee does not notify again, and the update uses a compare-and-set against the previous assignee.
- Meta handoff and AI/provider failure paths now check persistence of the pause, failed-message and processed-event state. A retried AI event with an existing uncertain outbound reservation will not call the provider again; it is marked for human review. The staging smoke target is additionally checked against an explicit staging runtime marker and distinct staging/production Supabase project references before any webhook POST.
- Rate limiting remains an external deployment gate. Cloudflare supports zone-level WAF rate-limiting rules that operate at the edge; configure a rule scoped to the staging/production hostname and `/api/whatsapp/webhook` (and separately the cron endpoint if appropriate), choose a request characteristic and threshold based on measured Meta burst/retry behavior, and prove it with a staging burst/recovery test. Confirm plan eligibility and record rule ID, expression, counting characteristics, threshold/window, and observed 429 behavior. The Workers Rate Limiting binding is also supported, but its counters are per Cloudflare location and eventually consistent, so it is not a globally exact shared counter. Neither option is configured in this repository. See [Cloudflare zone rate-limiting rules](https://developers.cloudflare.com/waf/rate-limiting-rules/) and [Workers Rate Limiting API](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/). Do not substitute an in-memory limiter or treat payload-size/signature checks as rate limiting.
- These changes are locally compiled and covered by focused safety/source-contract tests; staging tenant isolation, RLS behavior for employee access, notification delivery, provider fault injection, edge rate controls and live Meta signup remain unverified. The smoke script was not executed.
- Final local verification on 2026-10-20: `npm run build` passed using `ESTATEOS_NITRO_OUTPUT_DIR=work/estateos-final-local-20261020`; the Cloudflare Worker and static assets were generated successfully. `npm run lint -- --ignore-pattern "work/**"` exited 0 with four Fast Refresh warnings in the existing UI badge, button, form, and toggle components and no errors. `npm run test:safety` passed 31/31, including new checks for inactive/missing/cross-agency memberships, cross-agency and unassigned conversation access, admin-only compare-and-set reassignment, and no second AI/provider call for an uncertain retry. `git diff --check` exited 0 with Git's LF-to-CRLF notices. The earlier `work/estateos-verify-2026-10-20-a` output remains untouched. The staging smoke script was not run.
