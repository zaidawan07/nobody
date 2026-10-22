# EstateOS WhatsApp staging operator runbook

**Status:** Prepared, not executed. The script sends synthetic signed webhook requests that create/update staging rows. It does not call Meta's send API or the authenticated scheduler. Never point it at production.

## 1. Gate the staging environment

- [ ] Use a distinct staging Supabase project/database and a distinct HTTPS Cloudflare Worker hostname. The production schema remains **UNRECONCILED**; do not use production as a substitute for staging.
- [ ] Reconcile and apply only the approved staging schema, one reviewed migration at a time. Capture the staging migration ledger and test-data backup/reset process.
- [ ] Use a Meta app/test WABA and a Meta-issued test recipient number controlled by the operator. Configure the staging webhook as `https://<staging-host>/api/whatsapp/webhook`; subscribe `messages`, `account_update`, and `smb_message_echoes`.
- [ ] Set `ESTATEOS_DEPLOYMENT_ENV=staging` only on the dedicated staging Worker. Its `/api/staging/identity` endpoint must return the staging marker and the configured Supabase project reference. Confirm that reference is the staging project and differs from the separately recorded production project reference.
- [ ] Configure only staging credentials in the staging secret store: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `META_APP_ID`, `META_APP_SECRET`, `META_EMBEDDED_SIGNUP_CONFIG_ID`, `META_GRAPH_API_VERSION`, `META_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_TOKEN_ENCRYPTION_KEY`, `OPENAI_API_KEY`, `OPENAI_MODEL`, and `CRON_SECRET`. Email is optional.
- [ ] Confirm in the deployment settings that `WHATSAPP_LIVE_SEND=false` and `MESSAGING_LIVE_SEND=false`. Keep those values false throughout this runbook. The webhook smoke script does not read remote environment settings; the operator must verify them before running it.
- [ ] Configure the test agency's `handoff_keywords` to include `human`. Create the test contact/conversation using only the test recipient. Record explicit test opt-in through the agency UI, then schedule a future follow-up so the STOP test can prove cancellation.
- [ ] Keep an agency admin and an employee in the test agency, and a second agency account for tenant-isolation checks. Do not use real customer data.

## 2. Run local-only checks first

These commands use local fixtures and do not contact Meta, Supabase, OpenAI, or email:

```text
npm run test:unit
npm run test:safety
node test/run-tests.mjs
```

Expected current baseline: unit, safety and SQL/security suites pass. These prove helper/contract behavior and disposable PGlite policies; they do not prove the staging deployment, provider setup, or current production schema.

## 3. Run the staging webhook smoke script

The executable is `scripts/staging/whatsapp-webhook-smoke.mjs`, invoked with:

```text
npm run test:staging:whatsapp
```

Provide these process environment names through an approved local secret manager or secure terminal environment. Never put secret values in the command text, shell history, or logs:

- `ESTATEOS_STAGING_URL`: HTTPS staging origin.
- `ESTATEOS_STAGING_HOST_CONFIRM`: exact hostname from that URL, as an independent target check.
- `ESTATEOS_STAGING_MUTATION_ACK`: exact value `I_CONFIRM_STAGING_TEST_DATA_WRITES` after confirming the target is staging; this script will write synthetic test records.
- `ESTATEOS_STAGING_PROJECT_REF`: expected non-secret Supabase project reference for staging.
- `ESTATEOS_PRODUCTION_PROJECT_REF`: non-secret project reference the operator has independently confirmed is production; the script refuses if the two references match.
- `META_APP_SECRET`: staging Meta app secret, used in memory only to sign the synthetic webhook bodies.
- `ESTATEOS_TEST_WABA_ID`, `ESTATEOS_TEST_PHONE_NUMBER_ID`: numeric IDs for the connected staging test number.
- `ESTATEOS_TEST_WA_ID`: numeric Meta-issued test recipient ID, associated with the pre-opted-in test contact.

Before its first webhook POST, the script checks that the hostname has a staging/test/preview label and calls `/api/staging/identity`. It proceeds only when the Worker declares `ESTATEOS_DEPLOYMENT_ENV=staging`, the actual `SUPABASE_URL` project reference matches the expected staging reference, and the two supplied project references differ. It refuses HTTP redirects for the identity, webhook and scheduler requests. This is a fail-closed guard against target mistakes; the operator must still independently verify the URL and project configuration. An unset staging marker makes the identity endpoint return a generic 404.

The script reports only case names, HTTP statuses, and a random synthetic test reference. It does not print secrets, response bodies, full request URLs, project references, or customer message contents. It verifies:

1. Missing and invalid signatures return 401.
2. Signed malformed JSON returns 400; a signed unknown object is acknowledged without processing.
3. A signed synthetic inbound event and its duplicate are acknowledged.
4. A `human` keyword event is acknowledged for handoff processing.
5. A synthetic Coexistence echo and its duplicate are acknowledged.
6. A read receipt is applied; a later stale `sent` receipt is safely acknowledged without regressing state.
7. A STOP event is acknowledged.
8. An unauthenticated scheduler request returns 401. The script never sends an authenticated cron request.

The script does **not** activate live sends. The STOP check requires a dedicated disposable test contact and a future scheduled follow-up to exist before the run; after running, verify it was canceled and that the contact is opted out. STOP state persists by design, so do not reuse a contact for a later run without explicitly re-recording consent through the agency UI. Each run has a distinct test reference and repeated executions create additional synthetic events/messages.

If the script fails partway through, it prints the synthetic test reference even though it does not print payloads. Capture that reference before cleanup. After recording results, the staging operator must use the approved staging-only retention/reset procedure to remove that run's synthetic event/message rows and the dedicated disposable contact/conversation if appropriate; review the exact affected IDs and connection first. The script intentionally has no automatic cleanup, because deleting by a broad phone/name predicate could remove existing staging evidence or consent records. Never execute cleanup SQL in production.

## 4. Read-only staging verification

Use Supabase Studio's SQL editor in the staging project with a read-only role, or another supported read-only connector. Replace `<TEST_REFERENCE>` with the printed reference. Do not query message body, contact phone, ciphertext, IV, auth tag, or webhook payload.

```sql
-- Event idempotency and processing state
select provider_event_id, status, attempts, last_error
from public.whatsapp_webhook_events
where provider_event_id in (
  'message:wamid.EstateOSInbound<TEST_REFERENCE>',
  'message:wamid.EstateOSHandoff<TEST_REFERENCE>'
);

-- Exactly one inbound and one echo per provider message ID; verify state only
select direction, provider_message_id, status, count(*)
from public.whatsapp_messages
where provider_message_id in (
  'wamid.EstateOSInbound<TEST_REFERENCE>',
  'wamid.EstateOSEcho<TEST_REFERENCE>'
)
group by direction, provider_message_id, status;

-- Handoff and opt-out state; aggregate only
select count(*) as test_conversations,
       count(*) filter (where ai_paused_at is not null) as paused_for_human
from public.whatsapp_conversations c
join public.whatsapp_contacts p on p.id = c.contact_id
where p.name = 'EstateOS Staging Test';

select opt_in_status, count(*)
from public.whatsapp_contacts
where name = 'EstateOS Staging Test'
group by opt_in_status;

-- STOP should cancel the previously scheduled test follow-up
select status, count(*)
from public.whatsapp_scheduled_followups f
join public.whatsapp_contacts p on p.id = f.contact_id
where p.name = 'EstateOS Staging Test'
group by status;
```

These queries are for the isolated staging project only. Narrow the test-contact predicate to the test agency/connection if more than one test run shares that name. Never run a broad query against production.

## 5. Manual provider and authorization cases

| Case                                    | Staging action                                                                                                                                                                                                      | Pass evidence                                                                                                                                                                                                                                               | Boundary                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Embedded Signup and ownership           | As agency admin A, complete Meta's approved Coexistence flow for the test number; as an employee, attempt to begin signup; repeat inbox access as agency B.                                                         | Meta confirms eligible Business App + Cloud API state; connection is listed only for agency A; employee cannot connect; B cannot read A's connection.                                                                                                       | Requires Meta app permissions/review, test WABA, real staging accounts and connected number.                                                                                                                                                                                                                                              |
| Signed webhook and retries              | Run the staging smoke script; inspect event state and counts using the read-only queries.                                                                                                                           | Invalid signature rejected, valid test event processed once, duplicate does not create another inbound row or increment unread count twice.                                                                                                                 | Script writes synthetic staging rows.                                                                                                                                                                                                                                                                                                     |
| Connection isolation                    | With two staging agency connections, submit an event/status for connection B using a provider message ID owned by A; compare counts/state read-only in both agencies.                                               | B's event cannot mutate A's message; authenticated admin/employee views stay agency- and assignment-scoped.                                                                                                                                                 | Requires two connected staging fixtures; production schema/policies are not verified.                                                                                                                                                                                                                                                     |
| STOP and follow-up suppression          | Start with explicit opt-in and a future scheduled test follow-up; run script's STOP event; attempt no send while live-send switches remain false.                                                                   | Contact stays opted out; follow-up is cancelled; no AI or scheduler send is possible with sending disabled.                                                                                                                                                 | Requires the local scheduled-followup schema and staging test contact.                                                                                                                                                                                                                                                                    |
| Human handoff and routing               | Ensure keyword `human` is configured and run the script. Assign the resulting conversation to an active employee from the agency inbox; open it from the employee inbox and attempt a cross-agency conversation ID. | Conversation displays paused/needs-human; assignment creates a generic employee notification; the employee sees/replies only to their assigned same-agency conversations; other agencies and unassigned employee IDs are denied.                            | Local assignment and employee inbox now use server-side membership/assignment checks. Validate with two real staging agencies and employee accounts; lower-level RLS policy still excludes new WhatsApp conversations unless they bridge to a legacy conversation, so privileged reads must remain behind these checked server functions. |
| Scheduler authentication/duplicate jobs | Script checks missing bearer auth -> 401. Locally inspect claim contracts and SQL tests; in staging, only after safe setup, run two concurrent authorized scheduler invocations with `WHATSAPP_LIVE_SEND=false`.    | Unauthenticated call returns 401; with sending off, authorized call reports zero processed/sent; concurrent jobs claim each row once (no sends).                                                                                                            | Do not test authorized scheduler calls until an operator confirms remote `WHATSAPP_LIVE_SEND=false`.                                                                                                                                                                                                                                      |
| Rate limits                             | Configure a Cloudflare zone-level WAF rate-limiting rule matching the staging hostname and `/api/whatsapp/webhook`; separately assess `/api/cron/whatsapp-followups`. Confirm plan eligibility, choose threshold/counting characteristics from observed Meta traffic, and run a controlled staging burst/recovery test. | Above-threshold webhook requests are throttled at the edge and normal Meta retries resume without duplicate processing. Record zone, rule ID, expression, counting characteristics, threshold/window, plan eligibility, and observed 429/recovery behavior. | No rate limiter is configured by this repository. Cloudflare Workers Rate Limiting binding counters are per-location and eventually consistent, so do not describe them as a global exact counter. The zone WAF rule is an owner-managed deployment control, not configured or tested here. See Cloudflare's [WAF rate-limiting rules](https://developers.cloudflare.com/waf/rate-limiting-rules/) and [Workers Rate Limiting API](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/). |
| AI/provider failure fallback            | Local contract tests check that AI failure stores generic failure state and pauses AI for a human.                                                                                                                  | Local fallback contract passes; failures to persist the failed message, human pause, or processed-event state cause a retryable webhook error; duplicate AI reservation never triggers another provider call and uncertain state is routed to human review. | A real OpenAI failure path is gated by `WHATSAPP_LIVE_SEND=true`, which must stay false under this request. Do not enable sending to run it. A staging-only fault-injection path or separate approval is required before provider failure can be exercised end-to-end.                                                                    |

## 6. Closeout record

Record run date/operator, staging project and Worker hostname, deployment version, test reference, test case results, read-only row counts/statuses, rate-limit rule evidence, cleanup status, and blockers. Do not record provider secrets, customer phone numbers, message bodies, authorization headers, or credential values. A successful staging run is not evidence of production schema reconciliation or production readiness.
