# EstateOS / Property Desk — Product Completion Roadmap

## Purpose

Turn the current repository into a dependable multi-tenant real-estate CRM with official WhatsApp Cloud API integration. This roadmap separates code/CI readiness from a verified production launch. A green build does not prove that external services, database migrations, credentials, or real customer workflows work.

## Current verified baseline

- The repository has TanStack Start / React routes for authentication, bootstrap, agency settings, properties, leads, visits, team, conversations, WhatsApp, and platform administration.
- Supabase migrations exist for the multi-tenant foundation, profile/access hardening, and WhatsApp Cloud API protections.
- GitHub Actions CI and Edge Function type-check workflows have passed on the current remediation branch.
- A draft pull request contains a broad restoration/hardening diff. Review its full scope before merging.
- No production migration or deployment has been performed as part of this work.
- Meta credentials, a real Meta app/business, live webhook delivery, a recurring worker invocation, and a real Supabase schema/history have not been verified here.

## Release gates

A feature is not considered complete merely because its screen exists. It must pass:
1. UI happy path, validation, loading, empty, and failure states.
2. Server-side authorization and tenant isolation.
3. Database constraints, RLS, and migration testing from a clean disposable database.
4. Automated regression tests, including negative/unauthorized cases.
5. Operational logging and recovery behavior where asynchronous work is involved.
6. Documentation for configuration and support.

## Phase 0 — Stabilize the restored repository (P0)

- [ ] Review all 104 changed files in the draft PR against `main`; identify accidental duplicates, unrelated changes, and source-tree drift.
- [ ] Keep CI green for lint, typecheck, build, unit tests, and Edge Function checks.
- [ ] Add dependency/security scanning and secret scanning to CI.
- [ ] Make a clean-checkout setup guide and document required runtime variables without committing secrets.
- [ ] Add route-level smoke tests and a minimum supported browser/mobile viewport matrix.
- [ ] Resolve duplicate root-level source files versus `src/` only after confirming import and deployment behavior.

**Exit criteria:** reproducible clean install/build; all tests pass; diff reviewed; no accidental secrets.

## Phase 1 — Authentication, authorization, and tenant boundaries (P0)

- [ ] Test signup/invite/login/logout, session expiry, password recovery, and unauthorized route access.
- [ ] Verify agency provisioning and one-time super-admin bootstrap under concurrency and failure.
- [ ] Add automated RLS tests for every tenant-owned table: same-agency access succeeds; cross-agency reads/writes fail.
- [ ] Test suspended users/agencies, role changes, owner/admin/member permissions, and attempts to elevate roles.
- [ ] Verify all server functions validate the authenticated actor, agency membership, and input schema.
- [ ] Confirm storage buckets and object paths enforce tenant boundaries for property images and attachments.
- [ ] Test migrations against a fresh disposable Supabase project and a representative upgrade path; inspect actual production migration history before any production rollout.

**Exit criteria:** negative security tests pass; no client-controlled agency/role assignment; rollback and recovery are documented.

## Phase 2 — Complete core CRM workflows (P0)

### Properties
- [ ] Create/edit/archive property; validate price, type, location, status, and required fields.
- [ ] Upload, reorder, replace, and delete images securely.
- [ ] Search/filter/sort/paginate and handle no-results/error states.
- [ ] Prevent unauthorized changes and ensure archived/sold/rented states are consistent.

### Leads and pipeline
- [ ] Create leads manually and through supported inbound sources.
- [ ] Deduplicate safely; assign/reassign owners; support stages, priority, source, notes, and next follow-up.
- [ ] Maintain an activity timeline for status changes, assignments, and communications.
- [ ] Add task/reminder workflows and prevent duplicate reminders.

### Visits and team
- [ ] Schedule/reschedule/cancel visits with timezone-safe dates and clear statuses.
- [ ] Assign visits and capture outcomes/next steps.
- [ ] Verify team invitations, membership changes, role permissions, and removal/deactivation.

### Dashboard
- [ ] Define every metric and calculate it from tenant-scoped data.
- [ ] Ensure date ranges/timezones and empty states are correct.
- [ ] Add tests that compare dashboard aggregates with underlying records.

**Exit criteria:** a user can complete a lead-to-property-match-to-visit-to-follow-up workflow without manually editing the database.

## Phase 3 — WhatsApp Cloud API production workflow (P0)

- [ ] Configure Meta app, business, phone number, webhook subscription, Embedded Signup, and required permissions.
- [ ] Verify OAuth state/CSRF, redirect validation, token encryption/rotation, disconnect/reconnect, and least-privilege secret access.
- [ ] Verify webhook challenge and HMAC signature using the raw request body; reject invalid signatures.
- [ ] Persist inbound events idempotently and acknowledge quickly; handle retries, duplicate/out-of-order events, and dead-letter/replay.
- [ ] Configure a monitored recurring worker invocation with bounded batches, retry/backoff, stale-claim recovery, and alerting.
- [ ] Test inbound text/media, outbound messages, delivery/read/failure statuses, phone-number-to-agency mapping, and provider error handling.
- [ ] Enforce opt-out and the 24-hour customer-service window on the server. Outside the window, require approved templates; never let the browser alter opt-out or message-window timestamps.
- [ ] Add conversation assignment, internal notes, handoff, unread state, search, pagination, and delivery status UX.
- [ ] Add an end-to-end test using a Meta test number or controlled test account before enabling production traffic.

**Exit criteria:** real test messages flow both directions; events survive retries; opt-out and messaging rules cannot be bypassed; worker health is observable.

## Phase 4 — Automations and AI (P1, disabled by default)

- [ ] Build agency-configurable rules for new-lead acknowledgement, follow-up reminders, visit reminders, and assignment notifications.
- [ ] Add durable job records, idempotency keys, retry/backoff, cancellation, and per-agency rate limits.
- [ ] Add AI lead qualification and property matching with explicit data boundaries and citations/record references where appropriate.
- [ ] Require human handoff for uncertain, sensitive, or complaint scenarios; allow agencies to disable AI globally and per workflow.
- [ ] Ensure automation respects consent, opt-outs, approved-template requirements, and the WhatsApp service window.
- [ ] Log prompt/config version, model/provider, cost, outcome, and handoff reason without exposing secrets or unnecessary personal data.

**Exit criteria:** simulated failure and abuse tests pass; AI and outbound automation remain off until an agency explicitly enables them.

## Phase 5 — SaaS plans, usage, and billing (P1)

- [ ] Define plan entitlements and usage units for seats, properties, leads, messages, storage, and AI.
- [ ] Enforce entitlements in trusted server/database paths, including concurrent usage checks.
- [ ] Implement trial, active, past-due, cancelled, grace-period, and expired states.
- [ ] Integrate a payment provider only after choosing the target market and supported payment methods; verify signed webhooks and idempotent billing events.
- [ ] Provide invoices/receipts where supported, usage dashboards, plan changes, and a clear downgrade/over-limit policy.
- [ ] Keep platform-admin actions audited and inaccessible to agency users.

**Exit criteria:** entitlement tests pass under concurrent requests; billing events are replay-safe; plan state cannot be forged by clients.

## Phase 6 — Reporting, operations, and customer readiness (P1)

- [ ] Add structured server logs, error tracking, correlation IDs, health checks, and alerting without logging tokens/message contents unnecessarily.
- [ ] Document backup/restore, retention/deletion, incident response, key rotation, and disaster recovery.
- [ ] Add privacy policy, terms, acceptable-use policy, consent/opt-out explanation, and support contact.
- [ ] Verify responsive layout, keyboard navigation, labels, focus management, and accessible error messages.
- [ ] Add load tests for tenant-scoped list endpoints and webhook bursts; set rate limits and quotas.
- [ ] Add a staged rollout, smoke-test checklist, rollback procedure, and post-deployment verification checklist.

**Exit criteria:** an operator can detect and recover from a failed worker or integration; a test customer can onboard without developer database access.

## Deployment sequence (approval required)

1. Prepare a disposable/staging Supabase project and staging Meta app/number.
2. Apply migrations only to staging; test fresh install, upgrade, rollback/recovery, RLS, and storage access.
3. Configure secrets in the hosting provider and Supabase; never place service-role or Meta secrets in client-visible variables.
4. Deploy to staging, run smoke and end-to-end tests, and verify worker scheduling/alerts.
5. Review the full pull-request diff and migration effects.
6. Obtain explicit approval before merging to `main`, applying any production migration, or deploying production.
7. Roll out to a small test agency first; monitor errors, webhook queue age, message failures, usage, and spend.

## Important unknowns to resolve through verification, not guesses

- The actual deployed Supabase project schema and migration history.
- Hosting provider, production domain, environment variables, and deployment pipeline.
- Meta app/business verification, permissions, approved templates, and real phone-number configuration.
- Which payment provider and launch market will be supported.
- Whether the restored screens meet the intended business workflow and whether any original source was omitted.

## Definition of “complete”

The product is ready for a controlled launch only when all P0 exit criteria pass in staging, real WhatsApp integration tests pass, data isolation is proven by negative tests, operational monitoring is active, and rollback/recovery has been rehearsed. P1 features can then be enabled in measured releases rather than being represented as finished prematurely.
