# Database migration safety

The SQL migrations in this directory are staged source files only. No database was changed by creating these files.

Before applying them:
1. Confirm the target database and take a restorable backup.
2. Run `supabase migration list` against the target and inspect the remote migration history and actual schema.
3. If the foundation schema already exists but migration history is missing, reconcile the history first. Do not re-run the foundation migration against an existing schema; it creates enums, tables, policies, triggers and functions without broad idempotency guards.
4. Test both migrations against a disposable database with representative platform-owner, agency-admin and employee accounts. Verify tenant isolation, suspended-account access, and profile/agency column permissions.
5. The hardening migration intentionally aborts if more than one `super_admin` role exists. Resolve duplicates through an approved operational process rather than silently choosing an owner.

The security migration is additive and follows the foundation migration. It has not been applied to local, staging or production databases by this change.

The first-owner bootstrap endpoint also requires a server-only `PLATFORM_BOOTSTRAP_SECRET`. Configure it in the deployment's secret manager before using `/bootstrap`; never expose it through a `VITE_` variable.

## WhatsApp Cloud API prerequisites

The WhatsApp migration adds server-only token/session/webhook storage and deliberately removes broad browser access to the WhatsApp configuration table. The client must query only the safe columns granted in the migration; it must never request `select("*")` from `whatsapp_configs`.

Configure these server secrets before connecting a real number: `META_APP_ID`, `META_APP_SECRET`, `META_EMBEDDED_SIGNUP_CONFIG_ID`, `META_GRAPH_API_VERSION`, `META_TOKEN_ENCRYPTION_KEY` (base64-encoded 32-byte key), `META_WEBHOOK_VERIFY_TOKEN`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`. Keep all of them server-side. The Meta app must be reviewed/approved for the required WhatsApp permissions and use Embedded Signup v4.
