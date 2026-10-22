# Pilot Operations Runbook (EstateOS)

> **Historical snapshot (2025-10-17).** For current implementation state and launch gates, use [CURRENT_PILOT_STATUS.md](./CURRENT_PILOT_STATUS.md). The checklist and test table below have not been rerun as part of the 2026-10-19 work.

**Last Updated:** 2025-10-17  
**Environment:** Pilot deployment on Cloudflare Workers + Supabase

## Pre-Flight Checks

### Environment Configuration
- [ ] Verify `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in build env
- [ ] Verify runtime secrets set on Cloudflare: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`
- [ ] Verify `DATABASE_URL` for migration operations (local/tooling only)
- [ ] Check SMTP/Resend config if email delivery required
- [ ] Configure Meta WhatsApp Embedded Signup, webhook and test number for WhatsApp use

### Database Migrations
- [ ] Review pending migrations vs live state (`scripts/apply-migrations.mjs --dry-run`)
- [ ] Apply migrations only after explicit sign-off
- [ ] Note: `drizzle-kit migrate` cannot be used (journal incomplete) - use apply-migrations.mjs
- [ ] Pay special attention to 0016 (no subscription row → Free plan) - grandfather existing agencies first

### Build & Deploy Verification
- [ ] Run `npm run build` - must succeed
- [ ] Run type checking: `npx tsc --noEmit` - must be clean
- [ ] Run tests: `node test/run-tests.mjs` - all 159 sections pass
- [ ] Run parser tests: `node node_modules/tsx/dist/cli.mjs test/pkr-parser.test.ts` - 20/20 pass
- [ ] Deploy to staging/pilot: `npx wrangler deploy` (or `npx nitro deploy`)
- [ ] Verify health endpoint: `curl -fsS https://<host>/api/health` returns `{"ok": true, ...}`

## Security & Access Control

### RLS Verification
- **Status:** 18/18 tables have RLS enabled (verified live)
- **Coverage:** SQL security tests validate tenant isolation, cross-tenant access blocked, privilege escalation blocked
- **Helper Functions:** Cross-agency probes return null/false as expected

### Key Security Controls
1. **Tenant Isolation:** Agencies cannot access each other's data
2. **Assignment Scoping:** Employees limited to assigned resources
3. **Status Guards:** Sold/rented properties cannot revert to available/reserved (except via audited reopen)
4. **Plan Limits:** Enforced at DB level with triggers
5. **Function Lockdown:** SECURITY DEFINER functions have restricted EXECUTE
6. **Platform Bootstrap:** Single-use protection

## Monitoring & Operations

### Health Monitoring
- Endpoint: `GET /api/health` - unauthenticated, no-store cache, no DB access
- Expected: `200 OK` with `{"ok": true, "status": "ok", "service": "estateos", "time": "...", "uptime_s": ...}`

### Service Worker (PWA)
- Registered only in production (`import.meta.env.PROD`)
- Static assets cached only (`/assets/*`, icons, manifest, favicon, robots.txt)
- HTML and API responses never cached (tenant-scoped)
- Version bump required on non-hashed file changes (update `CACHE_VERSION` in public/sw.js)
- Emergency uninstall: replace sw.js with self-unregistering version (documented in DEPLOY.md)

### Cron Jobs
- Endpoint: `/api/cron/property-checkins` (protected by `CRON_SECRET`)
- Purpose: Process scheduled property check-ins

## Incident Response

### Security Incident
1. **Isolate:** If suspected cross-tenant access, review audit_logs and recent changes
2. **Verify:** Run security test suite to confirm RLS still holds
3. **Rollback:** Migrations are separate from deploy; either can rollback independently
4. **Document:** Log incident with timestamps, affected resources, remediation

### Performance/Availability
1. Check health endpoint
2. Review Cloudflare Worker logs
3. Verify Supabase connection (server functions depend on Supabase)
4. If service worker issue: use emergency uninstall procedure

### Data Issues
1. **Do not** run seed/clear scripts on pilot/prod (they target test projects only)
2. Use service_role operations carefully (bypass RLS - intended for admin ops)
3. Property reopen is the only audited way to reopen sold/rented properties
4. All mutations go through RLS-guarded paths

## Test Status (Credential-Free)

| Test Suite | Status | Notes |
|---|---|---|
| SQL Security (159 sections, 29 expected errors) | ✅ PASS | Deterministic, runs in PGlite |
| PKR Parser (20 cases) | ✅ PASS | Currency parsing logic |
| TypeScript | ✅ PASS | No compilation errors |
| Build | ✅ PASS | All bundles generated |

## Known Limitations (Not Blocking for Pilot)

- Invite email delivery: Requires SMTP/Resend config (copy-paste links work)
- Outbound Twilio: Optional; degrades gracefully without creds
- End-to-end browser tests: Not configured in current env
- No automated UI tests
- Usage counters: Table exists, no writer implemented yet (documented)
- WhatsApp AI replies and scheduled follow-ups are implemented locally; live provider delivery and deployment are unverified

## Pilot Readiness Criteria

- [ ] All credential-free tests passing
- [ ] Health endpoint responding correctly
- [ ] RLS verified (cannot access cross-tenant data)
- [ ] Environment secrets configured
- [ ] Migrations approved and applied (if pending)
- [ ] Deploy completed successfully
- [ ] PWA manifest and service worker verified

**Pilot Ready:** No - deployment, live database state, Meta setup, and end-to-end provider smoke tests remain unverified
