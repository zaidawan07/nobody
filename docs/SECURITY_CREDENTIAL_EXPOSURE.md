# Security credential exposure — required remediation

**Discovered:** 2026-10-20  
**Status:** PARTIALLY REMEDIATED — the owner reports that both credentials have been changed and the replacement values were kept out of Git. This report has not independently verified revocation of the old values, successful replacement across all consumers, or access-log review. Treat the historical values as compromised until those checks are complete. No secret values are included in this report.

## Evidence

A filename-only history scan identified a previously committed file named `env` in commit `f51e033` and its pre-removal history near `a25e1b3`. A value-safe scanner inspected the blob and reported these variable names/types only:

- `SUPABASE_SERVICE_ROLE_KEY`: value matched a Supabase secret-key pattern.
- `DATABASE_URL`: value matched a PostgreSQL connection-URL pattern.

The file is absent from the current tracked file list, and `.env` is ignored by Git, but historical Git objects remain accessible in repository history. The repository was previously identified as public. No values were printed, copied into this report, or sent to a provider.

## Required remediation before a pilot or further public distribution

1. **Credential rotation (owner-reported complete; independent verification pending).** The owner reports changing the exposed Supabase server credential and database password, and keeping replacement values out of Git. Confirm the exact Supabase key type and use the supported key-management flow to ensure the old credential is invalid. If it is a legacy JWT service-role key rather than a revocable secret key, follow Supabase's documented rotation procedure and assess session/service impact before changing the JWT signing secret.
2. **Consumer update and old-value verification (pending).** Confirm every legitimate consumer uses the replacement credentials, including local `.env`, Cloudflare Worker secrets, and any authorized CI/staging/backup tooling. Verify the old database password no longer works through supported provider checks, without pasting credentials into logs or chat.
3. **Check access logs and audit records** for unexpected database connections or privileged API usage since the first public exposure. Preserve redacted evidence and investigate anomalies.
4. **Verify secret hygiene** in Cloudflare, CI/CD, local environment files, and any other deployment. Do not reuse the exposed values.
5. **Decide repository visibility and history cleanup.** Removing a file in a later commit does not erase old blobs. History rewriting and force-pushing can disrupt collaborators and does not invalidate a copied credential; rotate first. No history rewrite, force-push, or repository visibility change has been performed.
6. **Re-run value-safe scans** against current tracked files and history after rotation/cleanup, and document the rotation date/key identifiers only (never the values).

## Owner verification procedure (no secret values in chat or logs)

Complete these checks in the provider consoles and authorized secret stores. Record dates, key labels/IDs, consumer names, and pass/fail only; do not copy credential values into tickets, shell output, screenshots, or this repository.

1. **Confirm invalidation.** In Supabase's project API-key management, identify the key type and confirm the exposed key is revoked/retired or has an enforced expiry. For the database password, use the supported database credential rotation flow and verify the previous password is rejected using a controlled, isolated connection attempt that does not place the value in command history or logs. A changed local environment variable alone does not prove invalidation.
2. **Confirm consumers moved.** Inventory approved consumers from deployment configuration and access ownership: local development, Cloudflare Worker secret names, authorized CI/staging, backup/restore tooling, and any other approved integration. Verify each consumer references the replacement key/version by metadata or a successful non-production health check. Do not print values to compare them. Remove obsolete copies from authorized secret stores after confirming dependencies.
3. **Review access records.** Review Supabase Auth/API/database connection logs and available project audit records for the period from first public exposure through old-key invalidation. Look for unknown source locations, unusual service-role operations, unexpected schema changes, and anomalous connection volume. Preserve an appropriately redacted evidence summary and escalate anomalies through the provider's incident process.
4. **Resolve repository exposure.** Record the owner decision to keep the repository public or restrict visibility, and whether history cleanup is approved. If rewriting is chosen, an authorized repository owner must coordinate all refs, forks/clones, branches, collaborators, and downstream mirrors; rewriting does not revoke a copied credential. This task will not rewrite history or change visibility.
5. **Verify hygiene.** Run value-safe tracked-file and history scans after the above decisions. Review only the scanner's variable names and categories; if a finding needs investigation, use a trusted secret-scanning service that masks values and handle remediation in the provider console.

## Owner-executable closeout checklist

The current repository still names the server setting `SUPABASE_SERVICE_ROLE_KEY`; its value may be either a legacy JWT service-role key or a newer Supabase secret key. Determine its key type from the Supabase dashboard using its label/identifier only. Creating a new key does **not** invalidate a legacy key; disable/deactivate the exposed key through the supported key-management flow only after its consumers are moved. See Supabase's [API key guidance](https://supabase.com/docs/guides/getting-started/api-keys) and [JWT signing-key guidance](https://supabase.com/docs/guides/auth/signing-keys). Do not regenerate the project JWT signing secret as a shortcut; its effect on keys and active sessions must be assessed against the current Supabase procedure.

### A. Prove the exposed service credential is unusable

- [ ] In the correct Supabase project dashboard, identify the exposed service credential by **type and dashboard identifier only**. Never copy it to notes or a terminal.
- [ ] Confirm every known consumer has moved to the owner-approved replacement using consumer/version metadata or a controlled staging health check (list below).
- [ ] In **Settings → API Keys**, deactivate the exposed legacy `service_role` key or delete the exposed secret key using the current Supabase flow. Record the key label/type, action, operator, UTC time, and dashboard confirmation that it is inactive/deleted. The dashboard's last-used indicator can help identify consumers, but is not proof by itself.
- [ ] Confirm a known staging server operation succeeds using the replacement and that the retired key is marked inactive/deleted. If Supabase offers a safe validation flow for the old key, verify it returns an authorization failure without placing the key in CLI arguments, shell history, logs, screenshots, or chat.
- [ ] If the credential was a legacy JWT and dashboard revocation requires a signing-key migration/rotation, stop and follow the current official migration sequence with an owner-approved outage/session plan. Do not improvise a JWT-secret rotation.

Supabase documents that legacy `anon`/`service_role` keys remain active when new publishable/secret keys are created; the legacy key has to be explicitly retired. Its current documentation also distinguishes API-key retirement from signing-key rotation. [API keys](https://supabase.com/docs/guides/getting-started/api-keys) · [Signing keys](https://supabase.com/docs/guides/auth/signing-keys)

### B. Prove the exposed database password is unusable

- [ ] Confirm the project database password was changed through **Database → Settings**. Record operator and UTC time, not the password.
- [ ] In a controlled isolated terminal on an approved machine, use the old password only at the database client's interactive password prompt against the intended endpoint. Do not put it in a connection URL, command argument, environment variable, script, command history, clipboard, or log. The attempt must fail authentication; stop after that single controlled attempt.
- [ ] Separately verify the replacement database credential works from an authorized staging/local consumer. A shared pooler can briefly report an authentication failure after a password change; follow Supabase's current [reset guidance](https://supabase.com/docs/guides/troubleshooting/how-do-i-reset-my-supabase-database-password) before treating a transient pooler error as evidence that the replacement is bad.
- [ ] Confirm every old authorized database consumer has either moved to the new password or been intentionally retired. Do not keep the old password in a local file to make later comparisons.

### C. Inventory legitimate consumers and prove replacement use

Complete one row per consumer. Use a key/version label or secret-manager version ID; do not record fingerprints derived from the secret itself.

| Consumer | Owner | Replacement reference/version | Safe success check | Result / UTC date |
| --- | --- | --- | --- | --- |
| Local development `.env` |  |  | Authenticated read-only staging/local request |  |
| Cloudflare Worker staging secrets |  |  | Staging health/authenticated server operation; inspect secret name/version only |  |
| Authorized CI or build jobs |  |  | Successful staging job; inspect secret reference only |  |
| Backup/restore tooling |  |  | Controlled staging connection or restore drill |  |
| Other discovered consumers |  |  | Consumer-specific non-production success check |  |

- [ ] Verify the list against deployment settings, CI secret references, worker bindings, backup ownership, and Supabase API-key last-used information. Do not query or print stored secret values.
- [ ] Remove retired credential versions from each approved secret store after replacement checks and retention requirements are satisfied.
- [ ] Confirm `.env` remains ignored, `.env.example` contains placeholders only, and no replacement value is committed.

### D. Review logs and record the conclusion

- [ ] Set the review interval from the first public exposure of commit `f51e033` through confirmed invalidation of both credentials. Record any retention gap explicitly.
- [ ] Review Supabase **Auth logs/audit logs** for unexpected sign-ins, token refresh/revocation, password changes, invitations, and account modifications. Review **API Gateway/PostgREST** logs for unusual privileged request volume and response errors; review **Postgres/Supavisor** logs for unexpected connections, source addresses, failed auth, DDL, and high-risk data access. Review organization Platform Audit Logs where the plan exposes them. Supabase documents the [log sources](https://supabase.com/docs/guides/observability/log-field-reference), [Auth audit logs](https://supabase.com/docs/guides/auth/audit-logs), and [Platform audit logs](https://supabase.com/docs/guides/security/platform-audit-logs); some sources/features depend on retention and plan.
- [ ] Review Cloudflare Worker logs and the authorized CI/deployment audit trail for unexpected deploys, requests, secret edits, or access during the same interval.
- [ ] Preserve a redacted evidence summary: source, time interval, reviewer, query/filter description, retention limits, anomalies and disposition. Do not attach raw logs containing customer data or authorization material.
- [ ] Decide and record repository visibility (`public` or `private`) and Git-history remediation (`approved`, `declined`, or `deferred`, with owner and date). Record whether relevant forks, clones, tags, branches, and mirrors were considered. The history rewrite itself remains an owner-authorized separate action and is not performed here.
- [ ] Rerun value-safe current/history scans and attach only the redacted scanner summary. Mark this exposure closed only when invalidation, consumer migration, log review, and repository decisions have evidence.

**Closeout record (no secret values):** reviewer / date / project reference / service-key type+status / database-password invalidation evidence / consumer inventory location / log interval+retention gaps / repository visibility decision / history decision / unresolved anomalies / approver.

## Safe scanner

`node scripts/scan-history-secret-types.mjs <commit:path> [...]` prints variable names and credential categories only. It intentionally never prints values. It is a triage tool, not a complete secret scanner or proof that every historical secret has been found.

## Completion evidence required

- [x] Owner reports that the Supabase server credential and database password were changed; replacement values were kept out of Git (not independently verified).
- [ ] Every intended consumer confirmed to use the replacement credentials.
- [ ] Old values verified invalid through the provider's supported checks.
- [ ] Access logs reviewed.
- [ ] Repository visibility decision recorded.
- [ ] If history cleanup is approved, rewrite performed by an authorized operator, all relevant refs/branches reviewed, and collaborators informed.
- [ ] Current and historical secret scans rerun after rotation.

**Do not mark this item complete based only on the file being deleted.**
