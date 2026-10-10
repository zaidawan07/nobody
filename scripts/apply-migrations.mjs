// Apply the full drizzle migration chain (0000..0008) to a real Postgres.
//
// Deliberately NOT drizzle-kit: drizzle/migrations/meta/_journal.json only
// lists 0000 and 0001, so `drizzle-kit migrate` would replay those two against
// a live database that already has them and never reach 0002-0008.
//
// Usage:
//   DATABASE_URL=postgres://... node scripts/apply-migrations.mjs
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
const files = getMigrationFiles(migrationsDir);

if (files.length === 0) {
  console.error(`No migration files found in ${migrationsDir}`);
  process.exit(2);
}

console.log(`Applying ${files.length} migrations from ${path.relative(root, migrationsDir)}/`);

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

try {
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
    if (r.errors.length) {
      for (const e of r.errors) console.log("      ! " + e);
      failed += r.errors.length;
    }
  }

  for (const file of files) {
    const { name, statements, errors, skipped } = await applyMigrationFile(client, file);
    totalStatements += statements;
    if (errors.length > 0) {
      failed += errors.length;
      console.log(`  ${name.padEnd(58)} ${statements} statements, ${errors.length} ERROR(S)`);
      for (const e of errors) console.log(`      ! ${e}`);
    } else {
      console.log(
        `  ${name.padEnd(58)} ${statements} statements${skipped ? ` (${skipped} idempotent)` : ""}`,
      );
    }
  }
} finally {
  await sql.end();
}

if (failed > 0) {
  console.error(`\nDone with ${failed} error(s) across ${totalStatements} statements.`);
  process.exit(1);
}
console.log(`\nAll ${files.length} migrations applied (${totalStatements} statements).`);

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
