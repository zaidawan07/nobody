// Shared helpers for applying the drizzle migration chain to a real Postgres.
// Pure functions so the behaviour can be verified without a live database:
// test/migration-runner.verify.mjs drives the same code path against PGlite.

import fs from "node:fs";
import path from "node:path";

/**
 * Split a .sql file into individual statements.
 * Respects single-quoted strings (with '' escapes), -- and /* *\/ comments,
 * and $tag$...$tag$ function bodies (CREATE FUNCTION ... AS $$ ... $$).
 */
export function* splitStatements(sql) {
  let buf = "";
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    const n = sql[i + 1];

    if (c === "-" && n === "-") {
      while (i < sql.length && sql[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && n === "*") {
      i += 2;
      while (i < sql.length && !(sql[i] === "*" && sql[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (c === "'") {
      buf += c;
      i++;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          buf += "''";
          i += 2;
          continue;
        }
        if (sql[i] === "'") break;
        buf += sql[i];
        i++;
      }
      buf += sql[i] ?? "";
      i++;
      continue;
    }
    if (c === "$") {
      const tag = /^\$[A-Za-z_0-9]*\$/.exec(sql.slice(i))?.[0];
      if (tag) {
        const end = sql.indexOf(tag, i + tag.length);
        if (end === -1) {
          buf += sql.slice(i);
          i = sql.length;
          continue;
        }
        buf += sql.slice(i, end + tag.length);
        i = end + tag.length;
        continue;
      }
    }
    if (c === ";") {
      if (buf.trim()) yield buf;
      buf = "";
      i++;
      continue;
    }
    buf += c;
    i++;
  }
  if (buf.trim()) yield buf;
}

/**
 * The migration files, in apply order. Derived from the filenames rather than
 * drizzle's meta/_journal.json, which only tracks 0000-0001 and would replay
 * them against a database that already has them.
 */
export function getMigrationFiles(migrationsDir) {
  if (!fs.existsSync(migrationsDir)) return [];
  return fs
    .readdirSync(migrationsDir)
    .filter((f) => /^\d+_.*\.sql$/.test(f))
    .sort()
    .map((f) => path.join(migrationsDir, f));
}

/**
 * Errors that are benign on a re-run of the same chain. Everything else is a
 * real failure and gets reported to the caller.
 *
 * - "already exists"          : CREATE TABLE / INDEX / POLICY without IF NOT EXISTS
 * - "duplicate key value"     : seeded reference rows re-inserted
 *
 * Deliberately narrow. A broad regex here would hide genuine breakage -- for
 * example "role authenticated does not exist" must NOT be swallowed, because
 * that means the target is not a Supabase-shaped database and the grant
 * silently did not happen.
 */
const IDEMPOTENT_ERRORS = [/already exists/i, /duplicate key value violates unique/i];

/**
 * Run one migration. Each statement is executed individually and errors are
 * collected rather than aborting, so one failure does not hide the rest of the
 * result.
 *
 * @param {{ exec: (sql: string) => Promise<unknown> }} client
 * @returns {{ name: string, statements: number, errors: string[], skipped: number }}
 */
export async function applyMigrationFile(client, filePath) {
  const name = path.basename(filePath);
  let statements = 0;
  let skipped = 0;
  const errors = [];

  for (const stmt of splitStatements(fs.readFileSync(filePath, "utf8"))) {
    statements++;
    try {
      await client.exec(stmt);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (IDEMPOTENT_ERRORS.some((re) => re.test(msg))) {
        skipped++;
        continue;
      }
      errors.push(msg.replace(/\s+/g, " ").slice(0, 200));
    }
  }
  return { name, statements, errors, skipped };
}
