# Implementation Status

Running log for the completion pass. Updated as phases land.

**Branch:** `chore/clean-stack` (not pushed, no upstream)
**Base for this pass:** `bd4d3d5`

---

## Phase 0 — Audit — COMPLETE

`docs/PRODUCT_COMPLETION_AUDIT.md` written. Database gate **passed** against `udkwbmvrhyeltdjogzjy`: 18 tables, RLS 18/18, 20 triggers, 19 functions. Migrations 0000–0008 are applied in substance; drizzle's tracking table is absent.

The "zero tables" observation in the brief did not reproduce; the likely cause is the direct host being IPv6-only. See the audit's correction section.

---

## Phase 1 — Authentication and security — IN PROGRESS

| Item | State |
|---|---|
| Sign-up / sign-in / sign-out / restore | Working, no change needed |
| Password reset | Working, no change needed |
| Role route protection | Working, no change needed |
| Server-side role assertions | Working, no change needed |
| Tenant isolation | Working, verified by 73-section battery |
| **Super-admin conversation access** | **GAP** — read-all policy is unqualified. Needs an explicit, auditable support-access mechanism. |
| **Invitation flow** | **PARTIAL** — accept page exists, no invite send path |

Plan: add a `super_admin_support_sessions` table plus RLS so a super admin can read another agency's conversations only through a recorded, time-boxed grant that writes an audit row. No work started.

---

## Phase 2 — Core product — IN PROGRESS

| Area | State | Next action |
|---|---|---|
| Agencies and team | Working | none |
| Properties | Working | add server-side status transition guard |
| Locations | Partial | 2 levels only; document source and extend, or state the limit honestly |
| Prices | Working | none |
| Leads | Working | align status vocabulary with the brief |
| Visits, check-ins | Working | none |
| **Notifications** | **Missing** | **building now** |

### Notifications — in progress

Migration `0009_notifications.sql`: table `public.notifications` with
`(id, user_id, agency_id, type, title, body, entity_type, entity_id, read_at, created_at)`.

- RLS enabled; four policies: user reads own, user marks own read, service_role inserts, agency admin reads agency-wide for auditing
- `revoke` of anon; no anon grant
- Server functions: `listNotifications`, `unreadCount`, `markRead`, `markAllRead`
- UI: bell in `AppShell` with unread badge, `/notifications` page with mark-one and mark-all
- Hooks fired from lead assignment and visit requests

Tests: cross-user read denial, cross-user mark-read denial, anon read denial.

---

## Phase 3 — Subscriptions and platform — MOSTLY COMPLETE

Plans, plan features, subscription records, manual super-admin management, and server-side limit enforcement all exist and are tested. Gaps:

- `usage_counters` has no writer — nothing records usage
- No expiry handling (a lapsed `trialing`/`active` row does not degrade access)

Both are documented, not built.

---

## Phase 4 — WhatsApp — NOT STARTED

Outbound Twilio exists and fails loudly without credentials. Missing: inbound webhook route, signature validation, idempotency, opt-out, handoff. **No live test is possible without provider credentials.**

---

## Phase 5 — AI assistant — NOT STARTED

`agency/ai.tsx` is configuration only. Missing: provider abstraction, the seven tools, Urdu/Roman-Urdu parsing, conversation state, handoff.

---

## Phase 6 — Reliability — PARTIAL

Env validation exists for Supabase. Missing: structured redacted logging, health check, documented backup/rollback guidance.

---

## Phase 7 — Verification — ONGOING

`docs/PRODUCT_VERIFICATION.md` is written as features land. Current gate: tsc 0 errors, 73 sections PASS, build green.

---

## Phase 8 — iOS and Android — NOT STARTED

Capacitor is the recommended path: the web app is already responsive and mobile-first. **Requires my approval before any dependency is added**, since that is an external-service/purchase decision. No native build exists on this machine (Windows, no Xcode, no Android SDK).

---

## Blocked on you

| Blocker | Why |
|---|---|
| Applying migrations to live DB | production change; requires explicit approval |
| Twilio or WhatsApp credentials | provider integration |
| AI provider credentials | provider integration |
| Capacitor installation | adds native toolchains and build requirements |
| Apple Developer / Google Play accounts | paid accounts |
| Supabase SMTP for email verification | project configuration |

## Unverified

| Item | Why |
|---|---|
| Live RLS under real users | no interactive session run |
| Outbound Twilio delivery | no credentials |
| Email verification end-to-end | no SMTP |

---

## Commits in this pass

_Filled as phases land._
