# EstateOS handoff for Claude

## Start here

Work in the existing checkout at `C:\Users\zaida\OneDrive\ドキュメント\Default Project`, branch `feature/pre-whatsapp`. The checkout has substantial uncommitted implementation. Inspect `git status` first and preserve every existing change; do not reset, rebase, clean, or force-push.

Read the original handoff at:

`C:\Users\zaida\.codex\attachments\32635ba7-ab90-4ef5-bf1c-ffba1216e1b1\Pasted text.txt`

Then read [CURRENT_PILOT_STATUS.md](./CURRENT_PILOT_STATUS.md), [WHATSAPP_PILOT_SETUP.md](./WHATSAPP_PILOT_SETUP.md), [PILOT_OPERATIONS_RUNBOOK.md](./PILOT_OPERATIONS_RUNBOOK.md), and repository instructions.

## Current implementation

The local app has the EstateOS property and lead CRM plus WhatsApp Business App Coexistence signup through Meta Embedded Signup, encrypted provider credentials, signed Meta webhooks, an agency inbox, inbound messages and delivery receipts, AI-assisted replies grounded in current listings, human handoff, opt-out handling, consent records, scheduled free-form/template follow-ups, cron authentication, and monthly AI/WhatsApp usage reservations.

Customers cannot connect a number merely by typing it into the app. They must authorize an eligible number in Meta's Coexistence flow. Live WhatsApp sends stay disabled unless `WHATSAPP_LIVE_SEND=true` is configured.

This turn improved scheduled follow-up reliability: known pre-send failures now retry after one and then two minutes, up to three claimed attempts. If the Meta request has started and delivery is uncertain, the send is not retried automatically to avoid duplicate messages. This logic is in `src/routes/api/cron/whatsapp-followups.ts` and `src/lib/whatsapp-followup-retry.ts`.

Server error reporting was hardened: exception messages and nested causes are omitted from logs because they may contain customer input or provider response details. Logs retain the error class, numeric HTTP status, and stack locations. Notification delivery failures no longer include user IDs or database error text. Regression coverage for error descriptions is in `test/error-capture.test.ts`.

## Latest local verification

Latest verification after the error-log redaction change (2026-10-20):

- `npm run test:unit` — PASS, 9 tests (includes `test/error-capture.test.ts`).
- `npm run test:safety` — PASS, 17 tests.
- `node test/run-tests.mjs` — PASS, 192 SQL/security sections and 32 expected-error guards.
- `node_modules/.bin/tsc.cmd --noEmit` — PASS.
- `npm run lint` — PASS, zero errors and four existing React Fast Refresh warnings.
- `git diff --check` — PASS with only LF/CRLF conversion warnings.
- `npm run build` — PASS with `ESTATEOS_NITRO_OUTPUT_DIR` pointed at a temporary verification output because OneDrive returned `EPERM` when the default `.output` reparse-point assets were being cleared. No production build was deployed.
- `node scripts/check-client-bundle.mjs` against that isolated build — PASS, 87 assets scanned with no server-only code, key name, or secret value found.

- `node test/run-tests.mjs` — PASS, 192 SQL/security sections; 32 expected guard errors (re-run 2026-10-20).
- `npm run test:safety` — PASS, 17 migration/environment/messaging-contract tests.
- `npm run test:unit` — PASS, 7 WhatsApp retry/opt-out tests.
- `node_modules/.bin/tsc.cmd --noEmit` — PASS, exit 0.
- `npm run lint` — PASS, zero errors and four existing React Fast Refresh warnings. A formatting error in `test/whatsapp-optout.test.ts` was fixed before this passing run.
- `npm run build` — PASS, Cloudflare Worker generated successfully (re-run 2026-10-20; Vite/Nitro emitted non-fatal plugin notices).
- `npm run check:pilot-env` — base app/database configuration ready; Meta, AI, cron, and email pending; live sending disabled. No provider/database request was made.
- `.env` is ignored by `.gitignore`; `git ls-files -- .env env .env.example .env.*` returned only `.env.example`.
- `git diff --check` — PASS; Git reports line-ending conversion warnings only.
- No production deployment, live Supabase migration, Meta number onboarding, or real provider send has been verified.

## External state and release gates

- GitHub repo `zaidawan07/nobody` was previously verified through GitHub's API as **public**. Do not push this local work until source privacy and commit history have been reviewed. Never print or copy `.env` contents, tokens, or keys. A prior committed `env` blob in `f51e033` contained credential-shaped values for `SUPABASE_SERVICE_ROLE_KEY` and `DATABASE_URL`; the owner now reports both were changed and replacements were kept out of Git. This is not independently verified: confirm old-value invalidation, consumer updates, and access-log review. History cleanup and repository visibility remain undecided; do not rewrite history or force-push without explicit approval.
- The intended Supabase ref is `udkwbmvrhyeltdjogzjy`. Supabase connector calls for project listing and direct lookup currently return `Unknown tool`; the live project schema and migration state remain unverified. Do not apply migrations `0014`–`0022` to any live database until the exact project and migration state are confirmed, each SQL migration is reviewed, and the owner explicitly approves the application.
- A public HTTPS deployment, server-side Meta/OpenAI secrets, Meta Embedded Signup/Coexistence configuration and approval, webhook subscription, eligible test number, approved template, and authenticated minute scheduler are still required.
- Complete an end-to-end smoke test covering onboarding, inbound messages, app echoes, AI replies and handoff, STOP, service-window enforcement, templates, delivery receipts, and safe follow-up retry behavior. Add billing, terms/privacy, backup, and monitoring decisions required for the intended commercial pilot.

## Latest local continuation — 2026-10-20

- Delivery receipts in `src/routes/api/whatsapp/webhook.ts` now validate known status values, use a safe fallback for invalid timestamps, write only against the resolved `connection_id`, store generic failure text and fail the webhook request if a receipt update fails. The local migration's monotonic status guard prevents late statuses from downgrading message state.
- Webhook parsing now accepts only JSON objects after raw-body signature verification. Unit tests cover valid/invalid HMAC, malformed JSON and primitive payloads, exact 1,000,000-byte acceptance, oversized chunked cancellation, and the receipt retry/scope contract.
- `claimSuperAdmin` compensates a failed role insert by deleting only the calling user's bootstrap row. A regression contract covers that sequence.
- Server function/provider adapters in `src/lib` no longer pass raw database/provider error messages to the browser; a source-contract test checks for regressions. User-facing errors remain operation-specific where already defined.
- Latest checks: `npm run test:unit` passed 20 tests; `npm run test:safety` passed 20; `node test/run-tests.mjs` passed 192 sections with 32 expected-error guards; `tsc --noEmit` passed; lint passed with zero errors and four existing Fast Refresh warnings; isolated Cloudflare build passed; client-bundle scan passed across 87 assets; pilot-env preflight reported core configuration ready and Meta/AI/cron/email pending with live sending disabled; `git diff --check` passed with only LF/CRLF conversion warnings.
- Live Supabase remains **UNRECONCILED**. No connector bypass, database access/write, migration, provider request, deployment, credential rotation, commit or push occurred in this continuation.

## Continue the work

Do real implementation and verification in this checkout, starting with current status and test output. Audit the complete customer path, fix concrete defects, add regression coverage, run project checks, and update the status/setup/runbook docs. Keep production and provider gates explicit. Do not claim sellable or production-ready until the external setup and end-to-end behavior are verified.

## Latest execution record — 2026-10-20

Against the existing checkout, the latest rerun passed: unit tests 20/20; safety tests 23/23; SQL/security suite 192 sections with 32 expected-error guards; TypeScript `--noEmit` exit 0; full ESLint exit 0 with four existing React Fast Refresh warnings; `check:pilot-env` reports core app/database ready, Meta/AI/scheduler/email pending and live sending disabled; `git diff --check` exit 0 with only Windows line-ending conversion warnings. Two formatting findings in the new staging smoke script were fixed before the passing lint rerun.

The staging webhook smoke command is prepared but not executed: it requires a separately configured HTTPS staging deployment, Meta test IDs/secret, and explicit acknowledgement that synthetic rows will be written. No live send, provider request, database connection, production migration, or production data change was made. Current live schema remains unreconciled because no supported read-only schema connector/evidence was available in this turn. Read `docs/whatsapp/staging/OPERATOR_RUNBOOK.md` for the operator procedure and `docs/LIVE_SCHEMA_RECONCILIATION_2026-10-20.md` for the exact schema evidence request and per-migration recovery gates.

## Later local implementation — 2026-10-20

Local WhatsApp routing is now implemented: agency admins can assign a conversation to an active employee in the same agency; employees have a separate assigned inbox and server-side checks restrict inbox, message, read-state and reply access by agency and assignee. The checks use service-role access only after validating the caller's active profile, agency role, and assignment. Staging and RLS validation are still required before any production use.

The staging smoke runner now requires a staging-like hostname, explicit staging and production Supabase project references, a staging runtime marker, and a public identity endpoint check before its first webhook request. It still writes synthetic staging records, never automatically cleans them, and must not be run until the runbook's staging setup/approval conditions are met. STOP leaves the test fixture opted out; use a disposable test contact and the documented staging cleanup/re-consent process.

No rate-limit binding or WAF rule is configured in the checked-in project. Cloudflare offers zone-level WAF rate-limiting rules for shared edge enforcement; configure the rule for the relevant hostname and `/api/whatsapp/webhook`, validate eligibility in the account plan, select a threshold from observed Meta traffic, and verify throttling/recovery in staging. The Workers Rate Limiting binding is available but counters are per-location and eventually consistent, so it is not a globally exact counter. See https://developers.cloudflare.com/waf/rate-limiting-rules/ and https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/. AI and handoff failure persistence now fails the webhook for retry if durable state cannot be saved, and duplicate uncertain AI reservations route to human review without a second provider call.

Final local verification on 2026-10-20: isolated Cloudflare build passed with `ESTATEOS_NITRO_OUTPUT_DIR=work/estateos-final-local-20261020`; full `npm run lint -- --ignore-pattern "work/**"` exited 0 with four Fast Refresh warnings (badge, button, form, toggle) and no errors; `npm run test:safety` passed 31/31; `git diff --check` exited 0 with Windows line-ending notices. Added contract tests cover inactive/missing/cross-agency memberships, cross-agency and unassigned conversation denial, admin-only compare-and-set reassignment, and no duplicate AI/provider call after an uncertain retry. Existing build output remains untouched. The staging script was not run, and no live database/provider was contacted.


## 2026-10-20 session addendum: webhook preflight hardening

- **Confirmed defect (fixed locally):** `POST /api/whatsapp/webhook` buffered the full request body with `request.text()` before checking the signature header, so an unauthenticated caller could force unbounded buffering.
- **Fix:** new `src/lib/webhook-guards.ts` (`webhookPreflight`, `isBodyWithinLimit`, 1 MB cap). The route now rejects a missing `x-hub-signature-256` (401), a malformed `content-length` (400) and an oversized declared or actual body (413) before HMAC verification. Signature verification itself was reviewed and is unchanged (constant-time, hex-validated).
- **Regression tests:** `test/webhook-guards.test.ts` (5 tests). Run with `npx tsx --test test/webhook-guards.test.ts`; not yet added to the `test:unit` script.
- **Results:** 12/12 unit tests pass (guards, opt-out, follow-up retry); `tsc --noEmit` passes; ESLint on the five touched files passes. Full `npm run lint` showed 3 prettier errors (new guard file plus `src/lib/error-capture.ts` and `test/error-capture.test.ts`), fixed with `eslint --fix` (formatting only). `npm run build`, `test:safety` and the SQL suite were not rerun after this change.
- **Still unverified:** live schema, Cloudflare edge rate limiting, provider behaviour, backup/restore. Credential rotation remains owner-reported only.
