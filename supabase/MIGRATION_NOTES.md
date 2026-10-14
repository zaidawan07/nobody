# Database migration safety

The SQL migrations in this directory are staged source files only. No database was changed by creating these files.

## Before applying

1. Confirm which database this repository is meant to target and take a restorable backup.
2. Run `supabase migration list` against the target and inspect the remote migration history and actual schema.
3. If the foundation schema already exists but its migration history is missing, reconcile the migration history first. **Do not re-run the foundation migration against an existing schema**; it creates enums, tables, policies, triggers, and functions without broad idempotency guards.
4. Test both migrations against a disposable database with representative platform-owner, agency-admin, and employee accounts. Verify tenant isolation and profile column permissions before production.
5. The hardening migration intentionally aborts if more than one `super_admin` role exists. Resolve duplicates through an approved operational process rather than letting a migration silently choose an owner.

The security migration is additive and follows the foundation migration. It has not been applied to local, staging, or production databases by this change.
