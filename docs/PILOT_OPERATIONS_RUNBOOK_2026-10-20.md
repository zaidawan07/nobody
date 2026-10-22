# EstateOS pilot operations runbook

**Updated:** 2026-10-20  
**Status:** Operational procedure draft. The checks below describe what to do; they do not claim that production monitoring, backups, or a public deployment are configured.

## Current safety state

- Local build, TypeScript, lint, SQL/security suite, migration safety tests, and local Wrangler smoke tests pass.
- Live Supabase project is healthy, but schema/migration drift remains unresolved. See `LIVE_SCHEMA_RECONCILIATION_2026-10-20.md`.
- A previously committed `env` file contained credential-shaped `SUPABASE_SERVICE_ROLE_KEY` and `DATABASE_URL` values in public Git history. Rotation/revocation and history remediation are open blockers; see `SECURITY_CREDENTIAL_EXPOSURE.md`.
- Live Supabase exposes 20 public tables and all have RLS enabled. Exact live policy/function/grant definitions still need verification.
- Meta WhatsApp, OpenAI, authenticated cron, email delivery, public staging, and production monitoring are not configured/verified.
- `WHATSAPP_LIVE_SEND=false` and `MESSAGING_LIVE_SEND=false` must remain in effect until a real pilot is approved and tested.
- Use `npm run check:pilot-env` for a local, secret-safe configuration preflight. It prints key names/status only, never values.

## Before any staging or production release

1. Confirm the intended Supabase project and Cloudflare account; never infer the target from a branch name.
2. Review `docs/LIVE_SCHEMA_RECONCILIATION_2026-10-20.md` migration by migration. The local dry run lists files only and is not a database diff.
3. Reconcile the exact function bodies, policies, grants/default privileges, triggers, constraints, enums, and data implications using an authorized read-only schema-inspection path.
4. Test the selected repair on a disposable database/branch. The current Supabase project lists only its default `main` branch; no separate staging branch exists.
5. Obtain explicit written approval before any live migration, production data change, deployment, or provider-side setup.
6. Run `npm run build`, `node_modules/.bin/tsc.cmd --noEmit`, `npm run lint`, `node test/run-tests.mjs`, `npm run test:safety`, and `node scripts/check-client-bundle.mjs`.
7. Deploy to HTTPS staging only after schema reconciliation. Confirm `GET /` and `GET /api/health` return 200 through the public host.
8. Keep live sends disabled until the test number, webhook signature verification, consent/STOP, template/service-window handling, retries, human handoff, and delivery receipts have passed.

## Monitoring

### Application and Worker

- Monitor Cloudflare Worker request volume, 4xx/5xx rates, CPU/timeouts, uncaught exceptions, and cron invocation failures.
- Set alerts for sustained 5xx, repeated webhook failures, follow-up backlog growth, and failed scheduled runs. Alert thresholds and notification destinations are not yet configured.
- `GET /api/health` is a liveness check only. It does not verify Supabase connectivity, provider configuration, cron health, or queue backlog.
- During an incident, correlate timestamps and request/event IDs across Worker logs, webhook events, and application audit records. Never log access tokens, authorization headers, encryption keys, full message bodies, or customer phone numbers unnecessarily.

### Supabase

- Review Database Health, security advisors, performance advisors, Auth events, and Postgres logs during staging and after each approved schema change.
- Alert on repeated authentication failures, elevated database errors, unexpected RLS/policy changes, storage growth, connection exhaustion, and sustained query latency.
- Do not blanket-revoke SECURITY DEFINER helpers or drop unused indexes solely because an advisor flagged them. Inspect callers, RLS dependencies, workload, and exact grants first.
- Enable and verify leaked-password protection before a public pilot. This Auth setting is currently reported disabled.

### WhatsApp automation

- Monitor webhook signature failures, failed event processing, duplicate event IDs, opt-out persistence failures, provider send errors, pending follow-ups, retry counts, and human-review cases.
- Alert on a growing queue/backlog and on any unexpected attempt to send while `WHATSAPP_LIVE_SEND` is false.
- Ensure the scheduler is authenticated with a strong `CRON_SECRET`, calls the follow-up route at its intended cadence, and does not expose the secret in logs or URLs.
- Never automatically retry after an ambiguous provider send result; route it to manual review to avoid duplicate customer messages.

## Backups and recovery

**Backup configuration is not yet verified.** Confirm the Supabase plan's actual backup retention and point-in-time recovery options in the project dashboard; do not assume a specific retention period.

Before an approved production migration:

1. Capture the current migration ledger and schema inventory.
2. Create a database backup/export using an approved, access-controlled process.
3. Verify the backup artifact exists, is encrypted at rest, and is stored outside the repository with restricted access.
4. Record the backup timestamp, operator, project reference, and recovery procedure without recording credentials.
5. Test restoration into an isolated staging database/branch before relying on the backup.

Recovery rules:

- App deployment rollback and database rollback are separate operations.
- Do not attempt to reverse a migration blindly or replay a foundation migration against a drifted schema.
- Prefer a reviewed forward-fix migration where rollback would risk data loss.
- After recovery, rerun the SQL/security suite, verify critical tenant-isolation paths, and inspect advisors.
- Define and approve the service's recovery point objective (RPO) and recovery time objective (RTO) before accepting production customers. Neither is currently established.

## Incident response

1. **Contain:** disable automated sending with the deployment configuration and revoke/rotate affected credentials if a provider or secret incident is suspected.
2. **Preserve evidence:** capture timestamps, event IDs, deployment version, and relevant redacted logs. Do not copy secrets or full customer content into tickets.
3. **Assess tenant impact:** inspect agency scoping, RLS, assignment checks, and audit logs; do not use a superuser shortcut as a diagnostic fix.
4. **Recover:** use the tested backup/restore path or a reviewed forward fix. Do not run seed/clear scripts against a pilot or production project.
5. **Validate:** repeat tenant-isolation tests, verify opt-out behavior, inspect failed webhook/follow-up queues, and confirm live sends remain disabled until explicitly re-approved.
6. **Record:** document cause, impact, timeline, remediation, and prevention measures.

## Release checklist

- [ ] Exact live schema/function/policy/grant reconciliation completed and reviewed.
- [ ] Approved migrations applied one at a time and live state independently verified.
- [ ] Staging URL and environment configuration verified.
- [ ] Backup retention and PITR capability confirmed; restore drill passed.
- [ ] Monitoring alerts and incident contacts configured and tested.
- [ ] Meta onboarding/webhook and OpenAI integrations tested using non-customer test data.
- [ ] Consent, STOP, service-window/template rules, delivery receipts, retries, and human handoff passed.
- [ ] Terms, privacy notice, data retention/deletion, and customer support contact reviewed for the operating jurisdiction.
- [ ] Billing provider, invoices/tax treatment, cancellation/refund policy, and subscription state transitions tested.
- [ ] Explicit pilot go/no-go recorded.

**Current decision: NOT READY for a real customer pilot.** The local app checks pass, but live schema reconciliation, staging, provider integrations, backup restore verification, monitoring, billing/legal review, and real pilot smoke tests remain open.

## Concrete open gates, owner, and closure evidence

| Risk order | Concrete gap                                                                                                                                                                                                                                                                                                        | Accountable owner                                        | Evidence required to close                                                                                                                                                                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1          | Exposed historical Supabase credentials have owner-reported replacements, but invalidation, consumer migration, access-log review and repository decisions are unverified.                                                                                                                                          | Supabase organization/project owner and repository owner | Completed no-secret-value record in `SECURITY_CREDENTIAL_EXPOSURE.md`; dashboard key status; consumer/version inventory; redacted log-review summary; visibility/history decision.                                                                                         |
| 2          | Live database schema is unreconciled; the available historical ledger/schema report does not provide exact present definitions.                                                                                                                                                                                     | Supabase project owner plus database/release engineer    | Supported read-only evidence bundle in `LIVE_SCHEMA_RECONCILIATION_2026-10-20.md`, exact per-migration diff, disposable-database run, backup/rollback decision, and separately approved migration execution.                                                               |
| 3          | No production backup/PITR configuration, retention, or restore drill is verified; no RPO/RTO is approved.                                                                                                                                                                                                           | Supabase project owner and operations lead               | Dashboard evidence for the actual plan/retention/PITR, encrypted restricted backup record, successful isolated restore drill, named RPO/RTO, and recovery log.                                                                                                             |
| 4          | Production/staging alert thresholds and destinations are not configured or tested; health endpoint is liveness only.                                                                                                                                                                                                | Cloudflare/Supabase owners and on-call lead              | Worker 4xx/5xx/timeout/cron alerts; database/auth/error/backlog alerts; delivery destinations; test alert receipt; retained redacted evidence.                                                                                                                             |
| 5          | Incident response has procedural steps but no named incident lead, security contact, support coverage, or tested escalation.                                                                                                                                                                                        | Business/security owner                                  | Named primary/backup contacts and escalation path, access to containment controls, completed tabletop record, notification/legal timelines reviewed.                                                                                                                       |
| 6          | No application-level webhook rate limiter was found; Cloudflare rate-control behavior is unverified.                                                                                                                                                                                                                | Cloudflare account owner and application security owner  | Approved staging edge rule, documented limit/window and Meta burst assumptions, and controlled staging burst test showing throttling and recovery without duplicate processing.                                                                                            |
| 7          | Local admin assignment, employee inbox/reply and generic notification are implemented with server-side same-agency membership/assignment checks; they are not exercised against staging, and the underlying RLS policy still only grants employee access to WhatsApp conversations bridged to legacy conversations. | EstateOS application owner and security reviewer         | Focused source-contract/type/build checks plus staging tests with two agencies, active/inactive employees, assignment changes and cross-agency IDs. Review whether employee access should be expressed in RLS through an approved schema change before production rollout. |
| 8          | Billing/payment provider, plan catalogue, invoices, tax/refund/cancellation treatment, and payment webhooks are not implemented/verified.                                                                                                                                                                           | Business owner and billing engineer                      | Provider/merchant decision, approved terms, signed replay-safe webhook tests, invoice/tax/refund evidence and plan/usage reconciliation; see `BILLING_AND_LEGAL_RELEASE_GATES.md`.                                                                                         |
| 9          | Jurisdiction, legal entity, agency/controller roles, privacy/terms, retention/deletion, consent copy, and subprocessors lack qualified approval.                                                                                                                                                                    | Business owner and qualified counsel                     | Jurisdiction/entity decision, approved published documents, data-processing/retention/deletion evidence and support/security contact.                                                                                                                                      |
| 10         | Meta/OpenAI/email/provider configuration and end-to-end staging behavior remain pending; live sends must stay disabled.                                                                                                                                                                                             | Meta app owner, deployment owner, and product owner      | Approved app/permissions, staging-only environment, runbook results and a separately recorded go/no-go. Never treat local checks as provider success.                                                                                                                      |

The matrix records gaps and evidence expectations, not completed controls. No monitoring, backup, rate limiting, provider setup, migration, or legal approval was configured by this documentation update.
