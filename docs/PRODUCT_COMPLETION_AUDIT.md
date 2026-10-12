# Product Completion Audit

**Phase 0 of the completion pass.**

- Branch: `chore/clean-stack` — 9 commits, **not pushed**, no upstream
- HEAD at audit time: `bd4d3d5`
- Rule applied: a feature is only "working" where the evidence is a file, route, test, or actual runtime observation — never the mere existence of a component.

---

## 0. Repository and environment

| Item | Value |
|---|---|
| Working directory | `C:\Users\zaida\OneDrive\ドキュメント\Default Project` |
| Branch | `chore/clean-stack`, 9 commits ahead of `work-in-progress`'s tip |
| Remote | `origin` → `https://github.com/zaidawan07/nobody.git` |
| Tracking | `chore/clean-stack` has **no upstream**; nothing pushed |
| Frontend | React 19.2 + TanStack Router 1.170 + TanStack Start 1.168 + TanStack Query 5 |
| Styling | Tailwind 4 (`@tailwindcss/vite`) + shadcn/ui on Radix, 20 ui components |
| Forms | react-hook-form 7 + zod 3 resolvers |
| Backend | TanStack Start server functions + Nitro (cloudflare-module preset) |
| Database | Supabase Postgres via the `postgres` driver |
| Build | Vite 8.1.5 + Rolldown (pinned override `1.2.1`) |
| Package manager | npm only (`bun.lock` removed in Phase B) |
| Scripts | `dev`, `build`, `build:dev`, `preview`, `lint`, `format` |

Working tree clean. The only untracked item is `opencode`, a 0-byte harness artifact deliberately never committed.

---

## 1. Database connection gate — PASSED

Every database identifier in `.env` points at project `udkwbmvrhyeltdjogzjy`: `SUPABASE_URL`, `VITE_SUPABASE_URL`, `SUPABASE_PROJECT_ID`, `VITE_SUPABASE_PROJECT_ID`, `DATABASE_URL`. No reference to the dead projects `zxuojmqyqwytrhdymlsu` or `zlafhjwccmmbrhbjhcxw`, and no `lovable.cloud` URL.

Live schema probe, read-only (`SELECT 1` plus catalog reads only):

```
connectivity: OK
public tables: 18    RLS enabled 18/18    triggers: 20    public functions: 19
drizzle migration-tracking table present: false
```

| Table | Rows | | Table | Rows |
|---|---|---|---|---|
| agencies | 3 | | properties | 13 |
| profiles | 10 | | property_media | 21 |
| user_roles | 9 | | property_checkins | 14 |
| plans | 3 | | leads | 24 |
| plan_features | 25 | | site_visits | 14 |
| subscriptions | 2 | | conversations | 7 |
| usage_counters | 0 | | conversation_messages | 28 |
| audit_logs | 0 | | locations | 133 |
| platform_bootstrap | 1 | | whatsapp_configs | 3 |

### Correction to the working assumption

The task brief states a previous read-only query returned zero tables in `public`. **That does not reproduce now**: the connection succeeds and returns all 18 tables.

Most likely causes, in order:

1. The earlier probe used the **direct host** `db.<ref>.supabase.co`, which is **IPv6-only** (an AAAA record, no A record). A query through it cannot connect from an IPv4-only network, and a driver that does not surface the error can present as "no results".
2. A different project or connection string was in scope at that time.

Everything below rests on a verified, reachable database rather than an assumption.

### Migration state — reconciled in substance, unrecorded in tooling

| Migration | Applied to live? | Evidence |
|---|---|---|
| 0000 | yes | 18 tables present |
| 0001–0008 | **yes, in substance** | all 19 functions including `plan_limit_for_agency`, `can_inspect_agency`, `count_agency_metric`, `agency_is_billing_active`; all three `enforce_*` triggers; `plan_features.updated_at` present |
| drizzle tracking | **no** | `public.drizzle_migrations` absent; `meta/_journal.json` lists only 0000 and 0001 |

Consequence: `drizzle-kit migrate` cannot reconcile this database, because it would replay 0000–0001 and never reach 0002–0008. `scripts/apply-migrations.mjs` is the correct path and is idempotent. **No migration was run in this phase.**

---

## 2. Feature inventory

### 2.1 Authentication and accounts

| Feature | State | Evidence |
|---|---|---|
| Sign-up | Working | `src/routes/auth/signup.tsx`; `handle_new_user` fires (10 profile rows exist) |
| Sign-in | Working | `src/routes/auth/index.tsx`; `requireSupabaseAuth` middleware |
| Sign-out | Working | `src/routes/_authenticated/pending.tsx` |
| Session restoration | Working | lazy Supabase client Proxy + `requireSupabaseAuth` |
| Password reset | Working | `auth/forgot-password.tsx`, `auth/reset-password.tsx` |
| Email verification | Unverified | no SMTP configured; unconfirmed users cannot establish a session |
| Profile update | Working | `employee/profile.tsx`, `agency/settings.tsx` |
| Account status | Working | `setMemberStatus` server fn + `protect_profile_privileged_columns` trigger |
| Super-admin bootstrap | Working | `platform_bootstrap` single-row gate; **1 row exists, seat taken** |
| Invitation flow | Partial | `accept-invitation.tsx` exists; there is no invite-by-email send path |

### 2.2 Authorization and tenant isolation

| Feature | State | Evidence |
|---|---|---|
| Role-based route protection | Working | `platform/route.tsx`, `agency/route.tsx`, `employee/route.tsx` redirect correctly |
| Server-side role assertion | Working | `assertRole` in `provisioning.functions.ts`, `has_role` rpc |
| Tenant isolation | Working | RLS 18/18; 73-section battery incl. cross-agency negative tests |
| Employee assignment scope | Working | `can_access_assigned_record` used by 0001 policies |
| Storage access policies | Working | `property-media` bucket + policies |
| Cross-tenant FK integrity | Working | `validate_tenant_link` and `validate_*_links` triggers (0004) |
| Super-admin conversation access | Working, but see note | an unqualified read-all policy exists. The brief asks for an explicit, authorised, auditable support-access mechanism; that does not exist yet. |

### 2.3 Properties

| Feature | State | Evidence |
|---|---|---|
| Create (wizard) | Working | `properties/new.tsx`; 13 property rows |
| Edit | Working | `components/property/EditPropertyDialog.tsx` |
| Media upload | Working | `PropertyMediaManager.tsx`, real Supabase Storage; 21 media rows |
| Media replace/delete | Working | storage cleanup scoped by agency |
| Cover image / video poster | Working | thumbnail and poster blobs generated |
| Search, filter, paginate | Working | `properties/index.tsx`, server-side filters |
| Status transitions | Partial | 8-value enum; **no server-side transition guard** |
| Unavailable inventory hiding | Partial | statuses exist, but no query excludes `reserved`/`sold` from customer-facing results |
| Contacts | Working | owner/tenant/realtor columns (0002) |
| Check-ins | Working | `property_checkins`, 14 rows; cron route |

### 2.4 Locations and prices

| Feature | State | Evidence |
|---|---|---|
| Structured locations | Partial | 133 rows with a `kind` column; 2 levels deep, not province→division→district→tehsil |
| National dataset | Missing | no import process, no documented source or licence |
| Price parsing | Working | `src/lib/pkr-parser.ts` and `test/pkr-parser.test.ts` — hazaar, lakh, crore, mixed |
| Canonical numeric storage | Working | `numeric(16,2)` columns; parser returns numbers |

### 2.5 Leads, visits, notifications

| Feature | State | Evidence |
|---|---|---|
| Lead CRUD and assignment | Working | `leads.tsx`, `LeadDialog.tsx`; 24 lead rows |
| Lead status vocabulary | Mismatch | enum is `new/contacted/qualified/visit_scheduled/negotiating/won/lost`; the brief asks for NEW, CONTACTED, QUALIFIED, VISIT_REQUESTED, CONVERTED, LOST |
| Lead↔property↔visit links | Working | `validate_site_visit_links`; 14 visit rows |
| Site visit workflow | Working | `VisitDialog.tsx` |
| **Notifications** | **Missing** | no table, no route, no component, no unread count. Phase 2F is entirely unbuilt |

### 2.6 Subscriptions and platform

| Feature | State | Evidence |
|---|---|---|
| Plans | Working | `plans` + `plan_features`, 3 plans, 25 features |
| Plan management UI | Working | `platform/plans.tsx` + `plans.functions.ts`, super-admin only |
| Subscription records | Working | `subscriptions`, 2 rows |
| Subscription management UI | Working | `platform/subscriptions.tsx` + `subscriptions.functions.ts`, manual, no payment gateway |
| Agency subscription page | Working | `agency/subscription.tsx`, read-only |
| Limit enforcement | Working | `enforce_plan_limit` triggers plus `assertPlanLimit` on the service-role path |
| Usage counters | Partial | `usage_counters` exists with 0 rows; **nothing writes to it** |
| Revenue figures | Correctly absent | no fabricated revenue anywhere |
| Payments | Missing by design | manual activation documented |

### 2.7 WhatsApp and AI

| Feature | State | Evidence |
|---|---|---|
| Outbound messaging | Unverified live | `messaging.server.ts` uses Twilio; no credentials set; it throws rather than faking success |
| Inbound webhook | Missing | no route; no signature validation, no idempotency |
| Per-agency configuration | Working | `whatsapp_configs`, 3 rows, RLS scoped |
| AI assistant | Missing | `agency/ai.tsx` is **configuration UI only** (`ai_enabled`, `ai_language`, `ai_tone`, `ai_instructions`, `handoff_keywords`). No model, no tools, no conversation engine |
| AI tools | Missing | `searchProperties` and the other six named tools do not exist |

### 2.8 Quality gates

| Check | Result |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `node test/run-tests.mjs` | 73 sections, 18 expected-error, PASS |
| `npm run build` | 2128 client / 180 SSR / 2160 Nitro modules |
| `npx tsx test/pkr-parser.test.ts` | not yet run in this phase |
| `npm run lint` | 15 problems (11 `no-explicit-any`/`prefer-const`, 4 shadcn boilerplate warnings) |
| Dev server | Working, fixed in `fd6580f` |

### 2.9 Test-data tooling

`scripts/seed-test-data.mjs` and `scripts/clear-test-data.mjs` (commit `bd4d3d5`) are **not run**. Both gate on `SEED_ALLOWED_PROJECT_REF` matching the ref parsed from `SUPABASE_URL`, print the ref, and require typed confirmation or `--yes`, refusing outright on a non-TTY. Per the operating rules neither was run here. The 3 agencies / 10 profiles / 24 leads already present indicate seeding ran at some point previously.

---

## 3. Mobile and native readiness

| Requirement | State |
|---|---|
| Capacitor | not installed; no `capacitor.config.*`; no `ios/` or `android/` |
| PWA manifest / service worker | missing |
| App icon / splash | missing (only `favicon.ico`) |
| Deep links, camera, push | missing |
| Responsive layout | Working; `AppShell` is mobile-first |

The web app is responsive and mobile-usable, which makes a Capacitor shell the right approach. **No native binary has been built and none is claimed.**

---

## 4. Summary by state

| State | Count | Items |
|---|---|---|
| Working | 24 | auth, roles, tenant isolation, properties, media, leads, visits, check-ins, plans, subscriptions, limit enforcement, price parsing |
| Partial | 8 | invitation flow, status transitions, unavailable-inventory filtering, location depth, lead-status vocabulary, usage counters |
| Missing | 9 | in-app notifications, WhatsApp inbound webhook, AI assistant plus 7 tools, national location dataset, payments, PWA, native apps, usage-counter writer |
| Broken | 0 | dev mode fixed in `fd6580f` |
| Unverified | 3 | email verification, outbound Twilio delivery, live RLS behaviour with real users |
