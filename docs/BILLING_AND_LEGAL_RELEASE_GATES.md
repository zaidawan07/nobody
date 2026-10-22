# Billing and legal release gates — EstateOS

**Updated:** 2026-10-20  
**Status:** Open requirements; not legal advice and not proof of compliance.

## Billing

The application currently has plans, plan features, subscriptions, and local usage-metering work. A payment processor, customer self-service checkout, webhook reconciliation, invoices, and production billing operations have not been verified as implemented.

Required before charging customers:

- Select the payment provider and supported countries/currencies.
- Define the plan catalogue, included quotas, overage behavior, billing period, trial rules, and upgrade/downgrade effective dates.
- Implement hosted checkout and customer billing portal without storing card data in EstateOS.
- Verify signed, replay-safe payment webhooks; idempotently handle payment success/failure, refunds, cancellations, disputes, and subscription renewals.
- Make the provider webhook the source of truth for paid subscription transitions; reconcile it against the local subscription row and usage entitlements.
- Test duplicate/out-of-order webhooks, failed payments, retries, cancellation, grace periods, refunds, and recovery from provider downtime.
- Define invoice/receipt contents, tax treatment, currency display, refund and cancellation terms for the actual operating jurisdiction.
- Never enable paid limits or mark an account paid solely because the browser returned from checkout.

The provider choice and merchant-account/API setup are intentionally deferred to the final integration phase.

## Legal and customer transparency

Before inviting real agencies or processing real customer messages, have a qualified reviewer for the actual operating jurisdiction approve:

- Terms of service and acceptable-use policy.
- Privacy notice covering agency users, leads, property owners, tenants, visitors, and WhatsApp contacts.
- Data controller/processor roles between EstateOS and each agency.
- Retention/deletion schedule for leads, conversations, message events, audit logs, and backups.
- Customer data export and account/agency deletion process, including provider-side data and backup retention limits.
- Consent wording and proof records for WhatsApp messages, check-in notifications, follow-ups, and marketing communications.
- STOP/opt-out handling, suppression retention, and how agencies manage contact consent.
- Subprocessor disclosures (Supabase, Cloudflare, Meta, OpenAI, email provider, and payment processor once selected).
- Security contact, support contact, incident notification process, and any required breach reporting.
- Cookie/local-storage/PWA disclosures where applicable.
- Rules for handling customer requests to access, correct, export, or delete personal data.

Do not publish generic template language as jurisdiction-specific legal compliance. The operating country, legal entity, data-controller arrangement, and applicable tax/privacy regimes must be established by the business owner and reviewed by qualified counsel.

## Go/no-go evidence

- [ ] Payment provider and merchant account approved.
- [ ] Payment webhook signature and idempotency tests pass.
- [ ] Plan limits agree with the billing catalogue and local usage-metering behavior.
- [ ] Terms and privacy notice approved and published.
- [ ] Consent and retention behavior verified in the application.
- [ ] Customer deletion/export workflow tested.
- [ ] Support and security contacts staffed.
- [ ] Pilot decision documented.

## Accountable owner and closure artifact

| Open gate | Accountable owner | Closure evidence |
| --- | --- | --- |
| Payment provider, merchant eligibility, catalogue, quotas and billing transitions | Business owner; billing engineer for implementation | Provider/country/currency decision; approved plan/pricing and cancellation/refund rules; signed webhook/idempotency test record; invoice/tax review; reconciliation showing subscription state and usage limits agree. |
| Jurisdiction, entity, customer terms, privacy, controller/processor and consent | Business owner; qualified counsel for review | Written operating-jurisdiction and legal-entity decision; counsel-reviewed/published terms/privacy notice; documented agency/EstateOS roles; approved consent/STOP/retention/deletion language and subprocessors. |
| Customer export/deletion and retention, including backups/provider copies | Product owner; counsel; data/operations engineer | Tested export and deletion flow, documented downstream/provider retention limits, retention schedule and redacted test evidence. |
| Legal/security/support contacts and breach escalation | Business/security owner | Named staffed contacts, escalation and notification procedure, tested tabletop record and documented response timing. |

Do not close a gate because a checklist or draft exists. Attach the described approval, configuration evidence, or test result and record the owner/date. Current evidence for these gates is **not available** in this repository; they remain open.
