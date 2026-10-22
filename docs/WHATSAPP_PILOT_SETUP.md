# WhatsApp pilot setup

The local app now includes Meta Embedded Signup, a signed WhatsApp webhook,
encrypted connection-token storage, an agency inbox, AI replies grounded in the
agency's available listings, opt-out handling, human handoff, and consent-gated
scheduled follow-ups. Live WhatsApp delivery is disabled until
`WHATSAPP_LIVE_SEND=true` is explicitly configured.

## Required owner setup

1. Confirm the target EstateOS Supabase project `udkwbmvrhyeltdjogzjy`; access is restored and the project reports `ACTIVE_HEALTHY` on PostgreSQL 17 (read-only check, 2026-10-20).
2. Reconcile the live schema before any migration work. The live migration ledger contains only `20261011115647 / 0009_lock_down_function_execute`, while local files span `0000`–`0024`; multiple objects expected from later migrations are absent. Some earlier migration objects exist despite missing ledger rows, so do not infer a safe starting point from the ledger or the local dry run. Follow `docs/LIVE_SCHEMA_RECONCILIATION_2026-10-20.md`; do not apply or mark migrations as applied without a reviewed recovery plan and explicit owner approval.
3. Configure a Meta app for **Embedded Signup v4**, WhatsApp Cloud API, and webhooks.
   Set the public callback to `https://<deployed-host>/api/whatsapp/webhook`,
   subscribe the app to `messages`, `account_update`, and `smb_message_echoes`,
   and enable each field for every WABA. Coexistence echoes keep replies sent
   from the WhatsApp Business app in the EstateOS inbox; account updates report
   when Meta disconnects a number. Meta requires
   App Review and Advanced Access to `business_management` and
   `whatsapp_business_management` for general release.
4. Add these server environment variables to the deployment:
   `META_APP_ID`, `META_APP_SECRET`, `META_EMBEDDED_SIGNUP_CONFIG_ID`,
   `META_GRAPH_API_VERSION`, `META_WEBHOOK_VERIFY_TOKEN`,
   `WHATSAPP_TOKEN_ENCRYPTION_KEY`, `OPENAI_API_KEY`, `OPENAI_MODEL`, and
   `WHATSAPP_LIVE_SEND=false`.
   Generate `WHATSAPP_TOKEN_ENCRYPTION_KEY` as 32 random bytes encoded in
   base64. Never put `META_APP_SECRET`, the encryption key, or the OpenAI key
   in client-side `VITE_*` settings.
5. Configure a trusted scheduler to POST to
   `/api/cron/whatsapp-followups` with the existing cron bearer secret. Run it
   each minute. Keep `WHATSAPP_LIVE_SEND=false` until you have tested with a
   Meta test number and confirmed a working pre-approved template.
6. An agency admin signs in, opens **WhatsApp inbox**, and selects **Connect
   existing number**. The number owner completes Meta's Coexistence flow,
   including its confirmation on the phone. EstateOS checks Meta's
   `is_on_biz_app` and `platform_type` status before displaying the number as
   connected. Coexistence is available only where Meta presents the eligible
   WhatsApp Business app path.
7. Turn AI on under **AI assistant** after setting an OpenAI model. Replies use
   only agency instructions and available property listing facts; unanswered
   questions are handed to an agent rather than inventing prices or availability.
8. Record customer opt-in in the inbox only after the customer explicitly agrees.
   Schedule free-form follow-ups only inside the open 24-hour service window;
   outside it, choose an already-approved Meta message template. STOP and related
   opt-out words immediately suppress both AI replies and scheduled sends.

## Smoke checklist for the connected pilot

- Meta webhook verification returns the supplied challenge only when its token
  matches; invalid `X-Hub-Signature-256` requests return 401.
- A customer message appears once in the correct agency inbox and opens the
  24-hour service window.
- AI replies include only the facts in the current available property list and
  agency instructions; a handoff keyword pauses further AI replies.
- A manual reply is rejected after the service window ends.
- A scheduled message is not sent without opt-in. A free-form message cannot be
  sent after the window; a template follow-up uses the exact approved template
  name and language.
- STOP records opt-out; subsequent AI and scheduled messages are suppressed.
- Credentials remain unreadable from authenticated browser sessions and are
  encrypted at rest with the separately configured encryption key.

## Known pilot boundaries

- The Meta app must be configured, approved, and reachable at a public HTTPS
  deployment before a customer can connect a number.
- Scheduled follow-ups require a scheduler that calls the protected cron route.
- Template sends currently support approved templates with no parameters. Add a
  template-component editor before supporting variable placeholders.
- The AI is intentionally constrained to the agency's current property records
  and instructions. It does not quote external market data or provide legal or
  financial advice.
- Do not apply migrations until the correct EstateOS project and its migration
  state are verified.
