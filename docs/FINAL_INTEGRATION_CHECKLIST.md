# Final Integration Checklist (EstateOS)

> **Historical snapshot (2025-10-17).** The current implementation and release gates are tracked in [CURRENT_PILOT_STATUS.md](./CURRENT_PILOT_STATUS.md). This checklist predates the WhatsApp implementation and does not verify the live database or a deployment.

**Last Updated:** 2025-10-17  
**Overall Status:** Historical; superseded by the current pilot status.

## Authentication & Authorization
- [x] User registration, login, logout
- [x] Password reset flow
- [x] Role-based access control (super_admin, agency_admin, employee)
- [x] Tenant isolation via RLS (18/18 tables)
- [x] Super-admin bootstrap protection
- [x] Team invitation flow (structure in place)
- [x] Server-side role assertions
- [x] Cross-tenant link integrity

## Core Product Features
- [x] Agency management
- [x] Property CRUD with media upload
- [x] Property status management with guards
- [x] Lead management and assignment
- [x] Site visit scheduling
- [x] Property check-ins
- [x] WhatsApp configuration per agency
- [x] Conversations and messaging (scoped)
- [x] Price parsing (PKR - crore/lakh/hazar etc, 20/20 tests)
- [x] Locations structure

## Subscriptions & Platform
- [x] Plans and plan_features management
- [x] Subscription tracking
- [x] Plan limit enforcement (triggers)
- [x] Usage counters structure
- [x] Billing activity checks
- [x] Cross-agency probe protection on helper functions

## Security & Testing
- [x] RLS policies comprehensive
- [x] SQL security test suite (159 sections, 29 expected errors)
- [x] Deterministic fixtures in PGlite tests
- [x] TypeScript compilation clean
- [x] Build succeeds
- [x] No credential-based tests in CI path
- [x] Function EXECUTE lockdown

## Documentation
- [x] DEPLOY.md - deployment procedures
- [x] PRELAUNCH.md - pre-launch checklist
- [x] IMPLEMENTATION_STATUS.md - current status
- [x] PRODUCT_COMPLETION_AUDIT.md - audit findings
- [x] ACCESS_CONTROL_MATRIX.md - access control mapping
- [ ] PRODUCT_VERIFICATION.md - final verification (not yet written as of earlier audit)

## Infrastructure
- [x] PWA manifest and service worker (static-only, production-only registration)
- [x] Health endpoint (/api/health)
- [x] Vite/TanStack Start build
- [x] Environment validation
- [x] Cloudflare Worker deployment config (Nitro preset)

## Test Execution Results
- **Security Tests:** 159 sections run, 29 expected errors, PASS
- **PKR Parser:** 20/20 cases PASS  
- **TypeScript:** No errors
- **Build:** Successful (2128 client / 180 SSR modules)

## Not Run / Blocked (as documented)
- **Live DB integration tests:** Requires actual Supabase project with credentials (not run)
- **Email delivery:** SMTP not configured
- **Outbound Twilio:** Credentials not configured (degrades gracefully)
- **Deploy:** Not executed (requires explicit sign-off)
- **End-to-end browser tests:** Playwright not configured/run in this environment

**Overall:** PASS - Core security and functionality verified via deterministic tests

## Current provider setup checklist (2026-10-20)

This section supersedes the historical integration notes above for current setup. Configure only in an approved staging deployment after the database recovery plan and credential-exposure gates are resolved. Keep values in the provider/hosting secret manager; never paste secret values into chat or commit them.

### Server environment names

- Core Supabase: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- Meta Embedded Signup and webhook: `META_APP_ID`, `META_APP_SECRET`, `META_EMBEDDED_SIGNUP_CONFIG_ID`, `META_GRAPH_API_VERSION`, `META_WEBHOOK_VERIFY_TOKEN`.
- WhatsApp credential encryption and send gate: `WHATSAPP_TOKEN_ENCRYPTION_KEY` (32 random bytes, base64 encoded), `WHATSAPP_LIVE_SEND=false`.
- AI: `OPENAI_API_KEY`, `OPENAI_MODEL`.
- Scheduler: `CRON_SECRET`; `CRON_SECRET_PREVIOUS` is optional during an intentional overlap/rotation only.
- Email invitations: `SMTP_HOST` or `RESEND_API_KEY`. Email is optional because the app supports copying invitation links.
- Legacy property check-in messaging, if enabled: `MESSAGING_LIVE_SEND=false`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_SMS_FROM` (WhatsApp sender is optional as documented in `.env.example`).

`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are public build-time settings, not secrets. `DATABASE_URL`, `SEED_ALLOWED_PROJECT_REF`, and `SEED_TEST_PASSWORD` are local migration/seed tooling settings and must not be configured in the browser bundle or ordinary production runtime.

### Callback, scheduler, and activation gates

- Meta webhook callback: `https://<staging-host>/api/whatsapp/webhook`; verification uses `META_WEBHOOK_VERIFY_TOKEN`. Subscribe `messages`, `account_update`, and `smb_message_echoes`.
- Scheduler: authenticated POST once per minute to `https://<staging-host>/api/cron/whatsapp-followups`, using `Authorization: Bearer <CRON_SECRET>`; never put the secret in a URL or logs.
- Safe sandbox checks: Meta test number, webhook verification and invalid-signature rejection, inbound/echo/status events, opt-in then STOP suppression, human handoff, service-window/template rules, and pre-send retry/ambiguous-send manual review. Do not treat mocked/local results as live integration success.
- Keep automated/live sends disabled until approved templates and sandbox delivery have been verified. Activate only after exact live schema reconciliation, staging smoke tests, owner approval, and resolved credential exposure remediation. Do not deploy or apply production migrations as part of this checklist.
