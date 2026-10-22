# WhatsApp Onboarding — Gap Analysis

Phase 0 deliverable. Read-only inspection; no code or schema was changed.

**Branch:** `feat/whatsapp-onboarding` (from `chore/clean-stack` @ `626d3c6`)
**Date of every Meta doc check below:** 2026-10-13

---

## A. What already exists (with evidence)

| Asset | Where | Notes |
|---|---|---|
| `whatsapp_configs` table | `drizzle/migrations/0000_multi_tenant_realestate_foundation.sql:225` | `agency_id` UNIQUE, `whatsapp_number`, `display_name`, `connection_status`, `connection_error`, `ai_*`, `handoff_keywords`, `auto_create_leads`, `last_connected_at` |
| `whatsapp_connection_status` enum | `0000:10` | **only 4 states**: `not_connected`, `pending`, `connected`, `error` |
| Admin-only RLS on configs | `0003_conversations_media_scope.sql:96-111` | admin read/insert/update/delete |
| `conversations`, `conversation_messages` | `0000:247`, `0000:266` | `UNIQUE (agency_id, customer_phone)`; lead-linked; 0012 gave them the no-super-admin helper |
| Outbound transport | `src/lib/messaging.server.ts` | Twilio, `sendCheckinMessage` (property check-ins only). Throws without TWILIO_* instead of faking success. Hardcodes `https://api.twilio.com/...` |
| Existing API route convention | `src/routes/api/cron/property-checkins.ts` | `createFileRoute` + `server.handlers.POST` |
| Bearer-secret auth pattern | `src/integrations/supabase/cron-auth.ts` | `authenticateCronRequest`, SHA-256 + `timingSafeEqual` — reusable shape for webhook verification |
| Server-only service-role client | `src/integrations/supabase/client.server.ts` | Proxy, lazy, `*.server.ts` import rule |
| Role model | `src/lib/access.functions.ts:4` | `AppRole = super_admin \| agency_admin \| employee`; `getMyAccess` server fn |
| Notifications | `drizzle/migrations/0010_notifications.sql`, `src/lib/notifications.functions.ts`, `/notifications` | server-side creation, recipient derived from the row — reusable for 80%/100% alerts |
| `usage_counters` | `0006:81` | `(agency_id, metric_key, period_start)` UNIQUE, `count`, `limit_value`. **Has no writer** — documented in the audit |
| `audit_logs` | `0006:108` | `actor_id`, `actor_role`, `agency_id`, `action`, `target_type/id`, `metadata`, `ip_address`, `user_agent`. Service-role INSERT only |
| `whatsapp_messages` as a plan metric | `0006:148,157,166` + `0008:5` | Enforced by `enforce_plan_limit` (0008), but **no table has that metric**, so it never fires |
| Test battery | `test/run-tests.mjs` | PGlite, statement-by-statement, expected-error assertions |
| Local migration runner | `scripts/apply-migrations.mjs` | `--from`, single transaction, `--dry-run` |

## B. Capability gap table

Legend: **exists** = usable as-is; **partial** = something is there but insufficient; **missing** = nothing.

### Phase 1 — Architecture and schema

| Capability | State | Evidence |
|---|---|---|
| `whatsapp_connections` (WABA id, phone_number_id, provider, quality/limits) | **missing** | Only `whatsapp_configs` (a settings row), no real connection record |
| 7-state machine | **partial** | `whatsapp_connection_status` has 4 states; no transition guard, no DB constraint |
| `whatsapp_credentials` (encrypted, key-version, server-only) | **missing** | No encryption code exists anywhere in `src/` |
| `whatsapp_webhook_events` | **missing** | No webhook route at all (`grep webhook` → only cron + docs) |
| `whatsapp_messages` / conversations table | **partial** | `conversation_messages` exists for AI chat, not provider messages; no `connection_id` |
| `whatsapp_contacts` (opt-in/opt-out + source) | **missing** | — |
| `whatsapp_usage` (agency, period, direction, category, provider_cost) | **missing** | `usage_counters` is the closest but has no cost/currency/category/direction |
| `whatsapp_limits` (quota, spend cap, AI-reply cap) | **missing** | Plan limits exist in `plans`/`plan_features`, but nothing agency-level or spend-based |
| `support_requests` | **missing** | — |
| `support_access_grants` | **missing** | — |
| Append-only audit for support access | **partial** | `audit_logs` exists and is service-role INSERT only — reusable |
| RLS policy matrix (role × table × operation) | **missing** | No such document |
| Atomic quota check-and-reserve | **missing** | `enforce_plan_limit` (0008) is a count guard on INSERT, not a reserve-and-consume |
| `MESSAGING_LIVE_SEND` kill switch | **missing** | No such env var |

### Phase 2 — Self-service wizard

| Capability | State | Evidence |
|---|---|---|
| Embedded Signup start (state + nonce) | **missing** | — |
| Callback/exchange endpoint | **missing** | — |
| Server-side WABA / phone-number ID validation | **missing** | — |
| Finalize setup / reconnect / disconnect | **missing** | `/agency/whatsapp.tsx:77` just upserts `whatsapp_configs` |
| Diagnostics | **missing** | — |
| Test message with explicit confirm | **missing** | — |
| Stepper wizard UI | **missing** | Current page is a single form (`whatsapp.tsx:104-177`) |
| Eligibility checklist | **missing** | — |
| State badges with next action | **partial** | `whatsapp.tsx:107` prints the raw enum string, no next action |
| Graceful failure copy (ineligible, duplicate, revoked, expired, outage, replay/CSRF) | **missing** | — |
| Duplicate phone_number_id handling | **missing** | No unique constraint on any provider id |

### Phase 3 — Assisted onboarding

| Capability | State | Evidence |
|---|---|---|
| Help Me Connect request + statuses | **missing** | — |
| Assignment / internal notes | **missing** | — |
| Staff checklist / screen-share guide | **missing** | — |
| Never collect passwords/OTP (UI copy + input validation) | **missing** | — |
| `support_access_grant` with scope/purpose/expiry/revocation | **missing** | — |
| Grant enforced in RLS (not just UI) | **missing** | — |
| Grant expiry / revocation / access logging | **missing** | — |
| No super-admin conversation bypass | **exists** | Migration 0012 + `test/08` — verified. Super admin reads 0 conversations |

### Phase 4 — Messaging service

| Capability | State | Evidence |
|---|---|---|
| `MessagingProvider` interface | **missing** | `messaging.server.ts` is a Twilio-specific function, not an interface |
| Meta implementation | **missing** | — |
| Twilio/BSP implementation | **partial** | `sendCheckinMessage` only — no signature verify, no status, no health, no templates |
| Mock provider | **missing** | — |
| Signature verification on raw body, constant-time | **missing** | — |
| Persist-then-ack webhook, async processing | **missing** | — |
| Idempotency via provider event id | **missing** | — |
| Monotonic delivery status | **missing** | — |
| Retry + backoff + jitter + dead-letter | **missing** | — |
| Every message resolves to a verified `connected` connection | **missing** | — |
| Inbound → lead match/create on normalized phone | **partial** | `conversations` has `UNIQUE (agency_id, customer_phone)` but **no normalizer**; PKR parser exists (`pkr-parser.ts`) so the pattern exists, not the phone one |
| Pakistani format handling (+92 / 03xx / 92xx) | **missing** | — |
| Template use outside the 24h window | **missing** | — |
| Opt-out honored before send | **missing** | — |

### Phase 5 — Cost and abuse controls

| Capability | State | Evidence |
|---|---|---|
| Per-agency metering with cost + category | **missing** | — |
| Atomic quota / spend-cap reserve | **missing** | — |
| 80%/100% admin notification | **partial** | Notification infra exists and is usable (0010) — the metering trigger does not |
| Revoked credentials → `attention_required`, pause queue | **missing** | — |
| AI auto-reply cap per conversation per window | **missing** | — |
| No auto-reply to automated/unknown/echo senders | **missing** | — |
| Outbound idempotency key | **missing** | — |
| Circuit breaker per connection | **missing** | — |

### Phase 6 — Testing and handover

| Capability | State | Evidence |
|---|---|---|
| RLS tests for new tables | **partial** | Battery exists (`test/run-tests.mjs`), no new tables yet |
| Webhook forgery/replay tests | **missing** | — |
| Credential-exposure tests | **missing** | — |
| Env var table, setup, deploy, rollback docs | **missing** | `docs/whatsapp/` is new |

---

## C. Verified Meta requirements

All accessed 2026-10-13 from `developers.facebook.com`. I did not work from memory for any of these.

### C.1 Embedded Signup

**Source:** <https://developers.facebook.com/docs/whatsapp/embedded-signup>

- Returns **WABA ID, business phone number ID, and an exchangeable token code** to the spawning window. Our server must then do four server-to-server steps: exchange the code for a **business token**, **register the number for Cloud API**, **subscribe our app to webhooks on the customer's WABA**, and (Solution Partners only) share a credit line.
- **A Tech Provider uses business tokens exclusively.**
- **Onboarding quota:** default **10 new business customers per rolling 7 days**, rising to **200** after Business Verification + App Review + Access Verification. Only newly onboarded customers count.
- **Hard limitation that hits this task directly:** *"Existing WhatsApp Business Accounts (WABAs) that were originally created via the developer app cannot be selected or onboarded directly through the Embedded Signup flow."*
- **Embedded Signup v2 is deprecated 2026-10-15 — two days after the date of this
analysis. This is urgent, not a future migration.** New work must target **v4**.

### C.2 Existing numbers / coexistence

**Source:** <https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users>

- A number already on the **WhatsApp Business app** *can* be onboarded ("Coexistence"), but requires the flow to be **customized** and **session logging** enabled. Requirements: customer on WhatsApp Business app **≥ 2.24.17**, our callback must accept and digest webhooks.
- The customer confirms via a code shown in the app; flow finishes with event `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING`; **the phone-number registration step must be skipped** because the number is already registered.
- If history/contacts sync is used, we have **24 hours to sync** after onboarding or the customer must be offboarded and repeat the flow.
- Coexistence numbers are capped at **20 mps** fixed throughput.
- The Deregister API **cannot** be used for a coexistence number; the customer disconnects from the app (→ `PARTNER_REMOVED` / `ACCOUNT_OFFBOARDED` webhooks).

### C.3 Webhook signature and retries

**Source:** <https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/create-webhook-endpoint>

- `POST` carries **`X-Hub-Signature-256: sha256=<SHA256_PAYLOAD_HASH>`**, an **HMAC-SHA256** of the raw JSON payload keyed on the **app secret**. Compare the part after `sha256=`. On mismatch, respond non-200. Valid TLS is required; self-signed is not supported.
- `GET` verification: `hub.mode=subscribe`, `hub.challenge`, `hub.verify_token` → respond 200 with the challenge.
- **Batched up to 1000 updates per POST; batching is not guaranteed.**
- **Retries:** immediately, then with decreasing frequency over **7 days**; *"Your server should handle deduplication in these cases."* Unacknowledged drops after 7 days.

### C.4 Pricing and billing

**Source:** <https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing>

- **Per-message pricing since 2025-07-01**; conversation-based pricing is deprecated. Only **template message deliveries are charged**.
- **All non-template messages are free** within an open customer service window; **utility templates delivered inside an open window are also free**. Nothing is free 72h outside an FEP window except within FEP.
- Rates vary by **template category (marketing/utility/authentication)** × **recipient country calling code**.
- **Pakistan (calling code 92) is a standalone market on the rate card**, not a regional rate. The April 1, 2026 update was *"Pakistan — Higher utility and authentication rates."*
- Volume tiers accrue **at the business-portfolio level across all its WABAs**, and only charged messages count.
- Billing happens in **Meta Business Suite**.

### C.5 Tech Provider requirements and billing

**Source:** <https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/get-started-for-tech-providers>

- Needs a **Meta app with the WhatsApp use case** + connected **business portfolio**.
- **Step 1 — Business Verification**, which must complete before App Review.
- **Step 2 — App Review** for **Advanced access** to `whatsapp_business_messaging` (to send for clients) and `whatsapp_business_management` (to reach client WABAs; without it those calls return error `200`). Video evidence required: one message sent and received, one template created.
- **"Billing — Your onboarded clients must add a credit card to your WhatsApp Business Platform Account."**

This is the decisive finding for the provider decision: **consolidated billing does not exist for Tech Providers.** Only a **Solution Partner** can share a line of credit, and that requires being/partnering with a Solution Partner, a line of credit, and accepting the Credit Allocation API terms.

### C.6 Opt-in and the 24-hour window

**Sources:** <https://developers.facebook.com/documentation/business-messaging/whatsapp/getting-opt-in>, <https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing>

- Businesses **must obtain opt-in before messaging**, per the November 2024 Messaging Policy. Requirements: state clearly that the person is opting in, **state the business name**, and comply with applicable law. Method is the business's choice (SMS, website, IVR, in person/paper).
- The **24-hour customer service window** opens when a user messages the business. Inside it, free-form messages are allowed; outside it, **only templates** may be sent. Users can also stop receiving **marketing** messages specifically and can block/report.

---

## D. External approvals I need you to obtain

These are outside the codebase and outside my control. None exist yet; I have not verified that any have been started.

| # | Approval | Blocks | Source |
|---|---|---|---|
| 1 | Meta business verification | App Review, and therefore all live onboarding | C.5 |
| 2 | App Review — Advanced access, `whatsapp_business_messaging` + `whatsapp_business_management` | Live mode; in dev mode only app admins/devs/testers see the permissions | C.5, C.1 |
| 3 | Access Verification | Raises the onboarding cap from 10 to 200 per 7 days | C.1 |
| 4 | Decide Tech Provider vs Solution Partner | Whether agencies pay Meta directly or we hold the credit line | C.5 |
| 5 | A payment method on every agency's WABA (if Tech Provider) | Any agency actually sending | C.5 |
| 6 | Approved message templates | Any message outside a 24h window | C.6 |
| 7 | A Meta app + app secret | Webhook signature verification | C.3 |
| 8 | A public HTTPS endpoint with a valid (not self-signed) certificate | Webhooks at all | C.3 |
| 9 | Sandbox test account (valid 30 days) | Testing Embedded Signup without polluting a real Meta account | C.1 |

I cannot obtain any of these and will not assume their status.

---

## E. What I could NOT verify

| Item | Why |
|---|---|
| Exact Pakistan per-message USD rates | The rate card is a CSV/PDF link, not inline text. I did not fetch it, so I have no number. Not guessing. |
| Whether Twilio (or another BSP) covers Pakistani WhatsApp onboarding and at what price | Not investigated in this phase; it is part of the Phase 1 provider comparison |
| Live-database shape beyond the 18 tables I read in migrations | No live schema probe was run in this phase |
| Embedded Signup **v4** API surface | v2 deprecation is dated 2026-10-15, i.e. two days after this inspection date, so v2 must not be built against. Flagging it as required reading before Phase 2. |
| Current `usage_counters` writer | Audit says none; I read the table definition only |

---

## F. Notes and risks worth your attention now

1. **The 4-state enum is not the 7-state machine.** `whatsapp_connection_status` has 4 values; the spec needs 7. Extending a Postgres enum is additive and safe (`ALTER TYPE ... ADD VALUE`), but it cannot be done inside a transaction with other DDL in older Postgres, and `ADD VALUE IF NOT EXISTS` is **not** idempotent in a plain re-run. This needs care in Phase 1.
2. **`whatsapp_configs` is a settings row with `agency_id UNIQUE`.** If `whatsapp_connections` is a separate table with its own `agency_id`, we need a partial unique index for "one active connection per agency", and we must decide whether `whatsapp_configs.connection_status` becomes derived or is dropped. **I recommend deriving it and dropping the column**, but that is a data decision for you.
3. **No crypto exists in the codebase.** Envelope encryption for credentials will be new code and new env keys. `MESSAGING_LIVE_SEND` also does not exist yet.
4. **`enforce_plan_limit` cannot be reused for spend caps.** It is a count-on-INSERT guard, and a spend cap needs atomic check-and-reserve with a race-free path. Phase 5 needs its own mechanism.
5. **The dev-mode permission trap.** Per C.1, in dev mode the permissions appear to admins/devs/testers only, so a wizard can *appear* to work in dev and fail in live. Every wizard test must be written so that distinction is visible.
6. **`whatsapp_messages` is already a plan metric.** If Phase 5 meters messages, we must decide whether metering feeds `usage_counters` or is independent. The task says keep whatsapp cost separate from Property Desk subscription billing — I will follow that, but the existing metric key makes an accidental collision easy.
