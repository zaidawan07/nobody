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
| Tenant isolation | Working, verified by the security battery |
| Super-admin conversation access | **Was NOT closed — real gap, fix is migration 0012 (pending, unapplied).** Earlier status note said "already closed by 0003"; that was wrong. See the corrected §2.2 in `PRODUCT_COMPLETION_AUDIT.md`. |
| Invitation flow | Partial: accept page exists, no invite-by-email send path |

## Phase 2 — Core product — IN PROGRESS

| Area | State | Next action |
|---|---|---|
| Agencies and team | Working | none |
| Properties | Working | status guard built (see below), pending apply |
| Locations | Partial | 2 levels only; document source and extend, or state the limit honestly |
| Prices | Working | none |
| Leads | Working | align status vocabulary with the brief |
| Visits, check-ins | Working | none |
| **Notifications** | **Built — migration `0010_notifications.sql`, pending apply** | apply with the rest of the batch |

### Notifications

Migration `0010_notifications.sql`: table `public.notifications` with
`(id, user_id, agency_id, type, title, body, entity_type, entity_id, read_at, created_at)`.

- RLS enabled; four policies: user reads own, user marks own read, service_role inserts, agency admin reads agency-wide for auditing
- `REVOKE ALL ... FROM anon, PUBLIC` on the table — a new table in `public` inherits `anon=ALL` from the schema default ACL
- Server functions: `listNotifications`, `unreadCount`, `markRead`, `markAllRead`
- UI: bell in `AppShell` with unread badge, `/notifications` page with mark-one and mark-all
- Hooks fired from lead assignment and visit requests

Tests: cross-user read denial, cross-user mark-read denial, anon read denial.

---

## Migration numbering — CORRECTED (2026-10-13)

The numbering in earlier status notes was wrong and is restated here.

Live `supabase_migrations` records exactly **one** row:
`20261011115647  0009_lock_down_function_execute`. 0000–0008 were applied
another way and are not recorded. The repo was missing the file that
corresponded to that recorded row, and used the number `0009` for a different,
unapplied migration.

Fixed: `0009_lock_down_function_execute.sql` was restored into the repo from the
live record itself, so it is byte-identical to what ran (verified by comparing
normalised text — see the report). The unapplied ones take the next free
numbers:

| # | File | State |
|---|---|---|
| 0000–0008 | existing | applied in substance, not recorded |
| 0009 | `lock_down_function_execute.sql` | **applied and recorded live**; restored to repo |
| 0010 | `notifications.sql` | unapplied |
| 0011 | `property_status_guard.sql` | unapplied |
| 0012 | `super_admin_no_conversation_access.sql` | unapplied |
| 0013 | `lock_down_new_function_execute.sql` | unapplied |

14 files, 14 distinct numbers, no collisions. Anything from 0010 up is pending
and needs explicit approval before it touches live.

---

## Function EXECUTE lockdown (0011, 0012, 0013)

Every SECURITY DEFINER function added by this batch now revokes
`PUBLIC, anon` explicitly:

| Function | Migration | Grants |
|---|---|---|
| `reopen_property(uuid, text)` | 0011 | `authenticated` |
| `guard_property_status_transition()` | 0011 | none — trigger only |
| `can_access_assigned_conversation(uuid, uuid)` | 0012 | `authenticated, service_role` |

`0010_notifications.sql` adds **no function** — a table, RLS and policies only,
so there was nothing to grant or revoke at function level. Its table gets
`REVOKE ALL ... FROM anon, PUBLIC`.

0013 additionally closes the schema default so future functions stop inheriting
anon. Verified live (read-only): `grantor=postgres, schema=public, objtype=f`
grants `anon=X`, so **every** function created in `public` after 0009 reopened
what 0009 had closed. What 0013 does not cover is stated in its header — most
importantly the second default-ACL entry (`grantor=supabase_admin`), which
`ALTER DEFAULT PRIVILEGES` cannot touch from a migration running as `postgres`,
and every object type except `objtype=f`. New **tables** still inherit
`anon=ALL` on live; that is deliberate (a forgotten table grant locks out real
users), and the two new tables revoke it themselves.

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

`docs/PRODUCT_VERIFICATION.md` is **still not written** — the final Phase 7 item. Current gate: tsc 0 errors, **122 sections PASS** (18 expected-error), pkr-parser 20/20, build green, dev-server smoke 28/28 routes.

---

## Phase 8 — iOS and Android — NOT STARTED

Capacitor is the recommended path: the web app is already responsive and mobile-first. **Requires my approval before any dependency is added**, since that is an external-service/purchase decision. No native build exists on this machine (Windows, no Xcode, no Android SDK).

---

## Blocked on you

| Blocker | Why |
|---|---|
| Applying migrations 0010–0013 to live DB | production change; requires explicit approval |
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
| 0013's `ALTER DEFAULT PRIVILEGES` | PGlite (the local battery) does not implement it, so it is proven only by reading live's default ACL, never by execution |
| `guard_property_status_transition` lost grants | `REVOKE ... FROM authenticated` is proven safe only in PGlite; needs a live re-run |
| The `supabase_admin` default-ACL entry | a migration running as `postgres` cannot alter it |

---

## Phase 2 — Property status correctness — COMPLETE

One consistent rule lives in src/lib/property-availability.ts: only
status = 'available' is recommendable; sold/rented are terminal. Every
availability decision now uses it.

- Migration 0011 adds a BEFORE UPDATE trigger refusing sold/rented ->
  available/reserved, plus reopen_property() as the single deliberate,
  recorded way back (audit row holds actor, agency, reason, both statuses;
  rejects reasons under 5 chars; refuses cross-agency and employee callers).
  No applied migration was edited.
- src/lib/property-status.functions.ts adds setPropertyStatusSafe (server-side:
  refuses a guarded transition and re-checks the row it just read, so a stale
  client cannot win) and checkAvailability.
- EditPropertyDialog no longer swallows the status-change error -- a refused
  write previously still reported "Property updated".
- $propertyId inline picker uses the same rule and offers "Reopen property"
  with a reason field when the current status is closed.
- queries.ts dashboard count uses isAvailableStatus instead of a literal.
- test/07_property_status.sql: T49-T58 covering allowed corrections, both
  guarded transitions, reopen + audit content, short reason, cross-agency,
  employee, log tenant-scoping, the availability rule, and a stale cache.

Not applied to live; proven against PGlite.

## Commits in this pass

_Filled as phases land._
