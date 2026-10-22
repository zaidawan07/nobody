# Access Control Matrix (EstateOS - Real Estate CRM)

**Last Updated:** 2026-10-20  
**Status:** Intended access model from local migrations; live policy definitions are not fully verified because the production schema and migration ledger are inconsistent. Live evidence: 20 public tables, all with RLS enabled.

## Roles

| Role | Description | Scope |
|---|---|---|
| `super_admin` | Platform administrator | Platform-wide access subject to explicit exclusions (e.g. conversation access per migration 0012) |
| `agency_admin` | Agency administrator | Full access within assigned agency |
| `employee` | Agency employee | Limited access based on assignment within agency |
| `anon` | Unauthenticated | No access (RLS enforced) |
| `authenticated` | Authenticated user | Role-dependent access |

## Core Tables Access Matrix

| Table | super_admin | agency_admin | employee | Notes |
|---|---|---|---|---|
| `agencies` | CRUD | RU (own agency) | R (own agency) | Super admin full control |
| `profiles` | CRUD | CRUD (own agency team) | R (own + colleagues) U (own) | Employee can only update own profile |
| `user_roles` | R CRUD via admin paths | R (agency) | R (own) | Role assignment restricted |
| `properties` | CRUD | CRUD (agency) | R (assigned) CU (assigned, scoped) | Employees limited to assigned properties; status transitions guarded |
| `property_media` | CRUD | CRUD (agency) | R (assigned property) | Scoped to assigned properties |
| `leads` | CRUD | CRUD (agency) | CRUD (assigned) | Assignment-based access |
| `site_visits` | CRUD | CRUD (agency) | R (assigned) | Scoped appropriately |
| `conversations` | CRUD* | CRUD (agency) | R (assigned) | *See note on super_admin access - restricted via can_access_assigned_conversation |
| `conversation_messages` | CRUD* | CRUD (agency) | R (assigned) | *Restricted for super_admin per 0012 intent |
| `whatsapp_configs` | CRUD | CRUD (agency) | None (R blocked) | Admin-only config |
| `plans` | CRUD | None | None | Platform config only |
| `plan_features` | CRUD | None | None | Platform config only |
| `subscriptions` | CRUD | R (own agency) | None | Agency admin sees own; super admin all |
| `usage_counters` | CRUD | R (own agency) | None | Platform/admin visibility |
| `audit_logs` | R | R (own agency) | None | Read-only for admins |
| `platform_bootstrap` | R (single row) | None | None | Bootstrap gate |

## Live verification and migration gap

The current live Supabase project exposes 20 public tables and all 20 have RLS enabled. This confirms RLS is on, not that every policy/grant matches this matrix. The migration ledger records only `0009`, while local migrations extend through `0024`; compare `docs/LIVE_SCHEMA_RECONCILIATION_2026-10-20.md` before treating any row below as live-verified.

The following locally planned objects are absent from the live schema and must not be considered operational yet: `agency_invitations`, `lead_activities`, `lead_followups`, `whatsapp_connections`, `whatsapp_credentials`, `whatsapp_contacts`, `whatsapp_conversations`, `whatsapp_messages`, `whatsapp_webhook_events`, `whatsapp_signup_sessions`, `whatsapp_scheduled_followups`, and `usage_events`.

## Security Controls

- **Row Level Security (RLS):** enabled on all 20 live public tables; policy semantics still need migration-by-migration verification.
- **Tenant Isolation:** local policy design uses `current_agency_id()` and helper functions; live definitions require comparison.
- **Assignment Scoping:** intended to limit employees to assigned resources; verify live policies before pilot.
- **Cross-tenant Link Integrity:** local migration triggers prevent references across agencies (0004); live trigger definitions need verification.
- **Plan Limit Enforcement:** local migrations define database trigger limits (0008, 0016); the live `plan_limit_for_agency` body needs verification.
- **Property Status Guards:** local migration prevents reverting sold/rented properties (0011); the live guard has a mutable search path and local migration `0024` hardens it, but has not been applied live.
- **Function EXECUTE Lockdown:** local migrations define restricted grants (0009, 0013); live grants/default privileges need exact verification.
- **Helper Function Protection:** local tests cover `plan_limit_for_agency` and `count_agency_metric`; verify live bodies and grants before relying on them.

## Test Coverage

- **SQL Security Tests:** 190 sections with 32 expected-error guards (all passing locally)
- **PKR Parser Tests:** 20/20 passing
- **TypeScript:** No errors
- **Build:** Successful

**Test Status:** PASSING (credential-free PGlite tests)
