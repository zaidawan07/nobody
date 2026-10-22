# EstateOS Product Verification

**Checked:** 2026-10-20  
**Branch:** `feature/pre-whatsapp`  
**Base HEAD:** `8b37287`  
**Scope:** Local working tree only. No production database changes, deployment, or push was performed.

## Verified locally

| Gate | Result | Evidence |
|---|---|---|
| TypeScript | PASS | `node_modules/.bin/tsc.cmd --noEmit` exited 0 |
| ESLint | PASS with warnings | `npm run lint`: 0 errors; 4 existing React Fast Refresh warnings in shared UI components |
| Production build | PASS | `npm run build` generated the Cloudflare Worker and static assets; compatibility date pinned to `2026-10-19` |
| Worker preview | PASS | `npm run preview` using Wrangler started locally; `GET /` and `GET /api/health` returned HTTP 200 |
| Client bundle guard | PASS | `node scripts/check-client-bundle.mjs` scanned 87 client assets and found no server-only code or secret values |
| SQL/security suite | PASS | `node test/run-tests.mjs`: 190 sections, 32 expected-error guards; includes migration `0024` and test `15_function_search_path.sql` |
| Migration-runner safety | PASS | `npm run test:safety`: 12 tests cover target-ref guard, single-migration enforcement, explicit write approval, and environment preflight |
| Focused WhatsApp tests | PASS | 4 retry-policy and Meta account-update tests passed |
| PKR parser | PASS | 20 parser cases passed |
| Pilot environment preflight | PASS with pending integrations | `npm run check:pilot-env`: base Supabase/database configuration ready, Meta/AI/cron/email pending, live sending disabled |
| Git whitespace check | PASS | `git diff --check` exited 0; Git emitted only LF/CRLF conversion warnings |

## Local security and reliability changes

- Invitation acceptance validates the authenticated user's profile email and agency, plus pending status and expiry, on the server before password change. The accepted transition is guarded against concurrent changes.
- Invitation resend refreshes the app-side expiry and guards its update against a concurrent revoke/accept.
- New migration `0023_atomic_invitation_revocation.sql` atomically marks an invitation revoked and removes its pre-provisioned role. Test coverage is in `test/14_invitation_lifecycle.sql`.
- New migration `0024_fix_property_status_guard_search_path.sql` pins the trigger-only property-status guard's search path; `test/15_function_search_path.sql` verifies the setting and confirms anon/authenticated cannot execute the trigger function.
- WhatsApp account-offboarding events now disconnect connections that were either connected or already in attention-required state.
- STOP handling does not mark a webhook event processed unless the opted-out state was successfully persisted.
- Worker compatibility date is pinned so the default Nitro `latest` date cannot resolve to a future date and break local preview.
- Lead and visit forms use typed payloads instead of unsafe `any` casts.

## Not verified / still required before a customer pilot

- **Credential exposure remediation:** Git history contains a previously committed `env` file with credential-shaped values for `SUPABASE_SERVICE_ROLE_KEY` and `DATABASE_URL`. Rotate/revoke them and verify invalidation before any pilot; see `docs/SECURITY_CREDENTIAL_EXPOSURE.md`. No secret values are stored in the report.

1. **Live Supabase schema/migration drift (read-only check, 2026-10-20):** Intended project `udkwbmvrhyeltdjogzjy` is accessible and `ACTIVE_HEALTHY` on PostgreSQL 17. Its migration ledger contains only `20261011115647 / 0009_lock_down_function_execute`, while local files span `0000`–`0024`. The live public schema has 20 RLS-enabled tables but lacks later-migration objects including `agency_invitations`, `lead_activities`, `lead_followups`, and `whatsapp_connections`. Some older objects do exist despite absent ledger entries, so this is schema/ledger drift, not proof that every migration after `0009` is unapplied. Do not apply missing migrations blindly or edit the live ledger until a per-migration schema reconciliation and reviewed recovery plan are approved. No live DDL or data changes were made.
2. **Source repository:** GitHub has reported `zaidawan07/nobody` as public. Review repository visibility and pushed history for credentials before any push; rotate any real credential found. No push was made.
3. **Deployment and integrations:** No staging or production deployment was made. Meta Embedded Signup, app permissions/review, webhook subscription, a real test number, OpenAI credentials, scheduler configuration, approved templates, and real provider delivery receipts remain unverified.
4. **Operations and legal:** Payment processing/self-serve billing, customer-reviewed terms and privacy pages, backup/restore proof, monitoring/alerting, and an end-to-end customer pilot have not been verified.

WhatsApp live sending remains disabled by default. Keep it disabled until the owner has connected and validated the real providers and test number. The product is a locally verified staging candidate, **not yet verified as production-ready or generally available**.
