// Apply the drizzle migration chain to a real Postgres.
//
// Deliberately NOT drizzle-kit: drizzle/migrations/meta/_journal.json only
// lists 0000 and 0001, so `drizzle-kit migrate` would replay those two against
// a live database that already has them and never reach 0002-0008.
//
// Usage:
//   node scripts/apply-migrations.mjs                 # whole chain 0000..
//   node scripts/apply-migrations.mjs --only 0024 --confirm-project-ref <ref> --confirm-reconciled-schema --confirm-production-write
//   node scripts/apply-migrations.mjs --from 0010 --dry-run
//
// --from selects a local filename boundary only; it does NOT identify which
// migrations are pending on a live database. The current production schema and
// migration ledger have drifted, so inspect docs/LIVE_SCHEMA_RECONCILIATION_2026-10-20.md
// and reconcile each migration before any write. Never infer the start point
// from the ledger or from --dry-run output.
//
// --dry-run lists exactly which files would run, in order, without connecting.
//
// The whole run happens inside ONE transaction. Any error other than the
// idempotent ones below rolls the entire batch back, so a failure cannot leave
// half the schema changed.
//
// The URL is read from the environment or .env -- never hardcoded, never printed.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getMigrationFiles, applyMigrationFile } from "./lib/migration-apply.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Pull the connection string out of .env without printing it. */
function readEnvfile() {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return {};
  const out = {};
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i > 0 && !line.trim().startsWith("#")) {
      let v = line.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
        v = v.slice(1, -1);
      out[line.slice(0, i).trim()] = v;
    }
  }
  return out;
}

const dotenv = readEnvfile();
const connectionUrl = (process.env.DATABASE_URL ?? dotenv.DATABASE_URL ?? "").trim();

// Strict: must parse as a URL and be a postgres:// / postgresql:// scheme.
// A whitespace-only or garbage value otherwise reaches the driver and either
// throws an opaque ERR_INVALID_URL or hangs on connect.
function validPostgresUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "postgres:" || u.protocol === "postgresql:";
  } catch {
    return false;
  }
}

if (!connectionUrl || !validPostgresUrl(connectionUrl)) {
  const found = connectionUrl
    ? "the value is not a postgres:// or postgresql:// URL"
    : "none was found";
  console.error(
    `No usable database connection string (${found}).\n` +
      "Set DATABASE_URL in the environment or in .env.\n" +
      "It must be the direct Postgres URL, e.g.\n" +
      "  postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres\n" +
      "The Supabase publishable key is NOT enough -- DDL needs a Postgres connection.",
  );
  process.exit(2);
}

let postgres;
try {
  ({ default: postgres } = await import("postgres"));
} catch {
  console.error("The 'postgres' driver is not installed. Run: npm install");
  process.exit(2);
}

const migrationsDir = path.join(root, "drizzle", "migrations");
const allFiles = getMigrationFiles(migrationsDir);

if (allFiles.length === 0) {
  console.error(`No migration files found in ${migrationsDir}`);
  process.exit(2);
}

// --- --from NNNN / --only NNNN and --dry-run ---------------------------------
const args = process.argv.slice(2);
function flagValue(name) {
  const i = args.indexOf(name);
  return i === -1 ? null : (args[i + 1] ?? null);
}
if (flagValue("--from") === null && args.includes("--from")) {
  console.error("--from needs a migration number, e.g. --from 0010");
  process.exit(2);
}
if (flagValue("--only") === null && args.includes("--only")) {
  console.error("--only needs a migration number or exact SQL filename, e.g. --only 0024");
  process.exit(2);
}
if (args.includes("--from") && args.includes("--only")) {
  console.error("--from and --only are mutually exclusive.");
  process.exit(2);
}
const fromRaw = flagValue("--from");
let from = 0;
if (fromRaw !== null) {
  from = Number.parseInt(fromRaw, 10);
  if (!Number.isFinite(from) || from < 0) {
    console.error(`--from must be a non-negative migration number, got "${fromRaw}"`);
    process.exit(2);
  }
}
const onlyRaw = flagValue("--only");
const dryRun = args.includes("--dry-run");

let files;
if (onlyRaw !== null) {
  const requested = onlyRaw.endsWith(".sql") ? onlyRaw : null;
  if (!requested && !/^\d{4}$/.test(onlyRaw)) {
    console.error("--only must be a four-digit migration number or exact SQL filename.");
    process.exit(2);
  }
  files = allFiles.filter((f) => {
    const basename = path.basename(f);
    return requested ? basename === requested : basename.startsWith(`${onlyRaw}_`);
  });
  if (files.length !== 1) {
    console.error(`--only must identify exactly one migration; received "${onlyRaw}".`);
    process.exit(2);
  }
} else {
  files = allFiles.filter((f) => {
    const m = /^(\d+)_/.exec(path.basename(f));
    return m ? Number.parseInt(m[1], 10) >= from : true;
  });
}

if (files.length === 0) {
  console.error(`No migrations at or after ${String(from).padStart(4, "0")}.`);
  process.exit(2);
}

if (dryRun) {
  console.log(
    `Dry run: would apply ${files.length} of ${allFiles.length} migrations, in this order:`,
  );
  for (const f of files) console.log(`  ${path.basename(f)}`);
  process.exit(0);
}

// Require an explicit target-ref confirmation before a live Supabase write.
// The local dry run intentionally remains connection-free and needs no flag.
function supabaseProjectRefFromUrl(value) {
  const u = new URL(value);
  const direct = /^db\.([a-z0-9]+)\.supabase\.co$/i.exec(u.hostname);
  if (direct) return direct[1];
  const pooled = /^postgres\.([a-z0-9]+)$/i.exec(decodeURIComponent(u.username));
  if (pooled && u.hostname.toLowerCase().endsWith(".pooler.supabase.com")) return pooled[1];
  return null;
}
const parsedConnectionUrl = new URL(connectionUrl);
const supabaseHost =
  parsedConnectionUrl.hostname.toLowerCase().endsWith(".supabase.co") ||
  parsedConnectionUrl.hostname.toLowerCase().endsWith(".supabase.com");
if (supabaseHost) {
  const actualRef = supabaseProjectRefFromUrl(connectionUrl);
  if (!actualRef) {
    console.error(
      "Refusing to apply: the Supabase project ref could not be safely inferred from DATABASE_URL.",
    );
    process.exit(2);
  }
  if (flagValue("--confirm-project-ref") !== actualRef) {
    console.error(
      "Refusing to apply migrations to Supabase without an exact target confirmation.\n" +
        `Expected: --confirm-project-ref ${actualRef}\n` +
        "Review the live schema and migration plan before confirming. This flag confirms the target only; it does not replace migration review or owner approval.",
    );
    process.exit(2);
  }
  if (onlyRaw === null) {
    console.error(
      "Refusing bulk Supabase migration batches. Use --only <single migration number> after reviewing that migration against the live schema.",
    );
    process.exit(2);
  }
  if (!args.includes("--confirm-reconciled-schema")) {
    console.error(
      "Refusing to write to Supabase without --confirm-reconciled-schema. " +
        "Reconcile each selected migration against the actual live schema first; the local dry run is not a schema diff.",
    );
    process.exit(2);
  }
  if (!args.includes("--confirm-production-write")) {
    console.error(
      "Refusing to write to Supabase without --confirm-production-write. " +
        "Use this only after explicit written owner approval and a reviewed migration-by-migration reconciliation.",
    );
    process.exit(2);
  }
}

console.log(
  from > 0
    ? `Applying ${files.length} migrations from ${String(from).padStart(4, "0")} onward, in one transaction:`
    : `Applying ${files.length} migrations from ${path.relative(root, migrationsDir)}/, in one transaction:`,
);
for (const f of files) console.log(`  ${path.basename(f)}`);

const sql = postgres(connectionUrl, {
  max: 1,
  onnotice: () => {},
  // Never hang: an unreachable host fails after 15s instead of blocking forever.
  connect_timeout: 15,
  idle_timeout: 30,
});
// `postgres` exposes .unsafe(); applyMigrationFile speaks .exec().
const client = { exec: (s) => sql.unsafe(s) };
let totalStatements = 0;
let failed = 0;
let skipped = 0;

try {
  // One transaction for the whole batch. If anything unexpected happens the
  // rollback below restores the exact pre-run state, so a failed batch can
  // never leave the schema half-migrated.
  await sql.unsafe("BEGIN");

  // The migration chain is written against a Supabase-shaped database: it
  // grants to `authenticated` / `service_role` / `anon`, and reads `auth.uid()`
  // and `storage.buckets`. A real Supabase project provides all of that
  // natively. A bare Postgres does not, so every GRANT would fail with
  // "role does not exist" and the policies would silently be unenforced.
  const isSupabase = await hasSupabaseShape(sql);
  if (isSupabase) {
    console.log("  target: Supabase-shaped (auth schema + authenticated role present)");
  } else {
    const stub = path.join(root, "test", "00_supabase_stub.sql");
    if (!fs.existsSync(stub)) {
      console.error("  target is not Supabase-shaped and test/00_supabase_stub.sql is missing.");
      process.exit(2);
    }
    console.log("  target: bare Postgres -> applying test/00_supabase_stub.sql first");
    const r = await applyMigrationFile(client, stub);
    totalStatements += r.statements;
    skipped += r.skipped;
    if (r.errors.length) {
      for (const e of r.errors) console.log("      ! " + e);
      failed += r.errors.length;
    }
  }

  for (const file of files) {
    const {
      name,
      statements,
      errors,
      skipped: fileSkipped,
    } = await applyMigrationFile(client, file);
    totalStatements += statements;
    skipped += fileSkipped;
    if (errors.length > 0) {
      failed += errors.length;
      console.log(`  ${name.padEnd(58)} ${statements} statements, ${errors.length} ERROR(S)`);
      for (const e of errors) console.log(`      ! ${e}`);
      break; // stop before touching anything further
    }
    console.log(
      `  ${name.padEnd(58)} ${statements} statements${fileSkipped ? ` (${fileSkipped} idempotent)` : ""}`,
    );
  }

  if (failed > 0) {
    await sql.unsafe("ROLLBACK");
    console.error("\nRolled back. Nothing from this run was kept.");
    process.exit(1);
  }

  await sql.unsafe("COMMIT");
} catch (e) {
  try {
    await sql.unsafe("ROLLBACK");
  } catch {
    // The connection may already be gone; the exit code is what matters.
  }
  console.error(
    `Run aborted and rolled back: ${String(e && e.message ? e.message : e).slice(0, 300)}`,
  );
  process.exit(1);
} finally {
  await sql.end();
}

console.log(
  `\nCommitted ${files.length} migration(s), ${totalStatements} statements` +
    `${skipped ? `, ${skipped} idempotent skips` : ""}.`,
);

/**
 * Distinguishes "connected and this is not Supabase" from "could not connect".
 * A connection failure must abort the run: silently assuming "bare Postgres"
 * and continuing would apply the stub against an unreachable host and report
 * nothing useful.
 */
async function hasSupabaseShape(client) {
  let rows;
  try {
    rows = await client`
      SELECT
        EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth') AS auth_schema,
        EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') AS authenticated_role
    `;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(
      `Could not query the target database.\n  ${msg.replace(/\s+/g, " ").slice(0, 200)}\n` +
        "Check that DATABASE_URL points at a reachable Postgres and that the password is correct.",
    );
    process.exit(3);
  }
  return Boolean(rows[0]?.auth_schema && rows[0]?.authenticated_role);
}
