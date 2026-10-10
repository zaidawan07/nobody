// Runs the security test battery against an in-process WASM Postgres (PGlite).
//
// Mirrors the psql flow in test/README.md without needing a Postgres server:
//   00_supabase_stub.sql -> migrations 0000..0007 -> 01_seed.sql ->
//   02_security_tests.sql -> 03_extended_security_tests.sql ->
//   04_super_admin_security_tests.sql
//
// psql meta-commands (\set, \pset, \echo) are handled in JS; every other
// statement is executed with error capture, like psql ON_ERROR_STOP=off.
// A statement whose preceding \echo banner contains '(expect ERROR' that does
// NOT raise is a FAILURE (the guard did not hold); any statement outside such
// a banner that DOES raise is a FAILURE (unexpected error).
//
// Requires @electric-sql/pglite. Usage: node test/run-tests.mjs

import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = [
  "test/00_supabase_stub.sql",
  "drizzle/migrations/0000_multi_tenant_realestate_foundation.sql",
  "drizzle/migrations/0001_tenant_isolation_and_employee_scope.sql",
  "drizzle/migrations/0002_property_contacts_media_checkins.sql",
  "drizzle/migrations/0003_conversations_media_scope.sql",
  "drizzle/migrations/0004_tenant_link_integrity.sql",
  "drizzle/migrations/0005_real_media_and_locations.sql",
  "drizzle/migrations/0006_super_admin_plans_subscriptions_usage_audit.sql",
  "drizzle/migrations/0007_super_admin_platform_lockdown.sql",
  "test/01_seed.sql",
  "test/02_security_tests.sql",
  "test/03_extended_security_tests.sql",
  "test/04_super_admin_security_tests.sql",
];

// Split on top-level semicolons while respecting '...', --comments, /* */,
// and $tag$...$tag$ bodies.
function* splitStatements(sql) {
  let buf = "";
  let i = 0;
  const n = sql.length;
  let quoteTag = null;
  while (i < n) {
    if (quoteTag !== null) {
      if (sql.startsWith(quoteTag, i)) {
        buf += quoteTag;
        i += quoteTag.length;
        quoteTag = null;
        continue;
      }
      buf += sql[i++];
      continue;
    }
    const ch = sql[i];
    if (ch === "'") {
      buf += ch;
      i++;
      while (i < n) {
        buf += sql[i];
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            buf += sql[++i];
            i++;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    if (ch === "-" && sql[i + 1] === "-") {
      const j = sql.indexOf("\n", i);
      const end = j === -1 ? n : j;
      buf += sql.slice(i, end);
      i = end;
      continue;
    }
    if (ch === "/" && sql[i + 1] === "*") {
      const j = sql.indexOf("*/", i + 2);
      const end = j === -1 ? n : j + 2;
      buf += sql.slice(i, end);
      i = end;
      continue;
    }
    if (ch === "$") {
      const m = /^\$[A-Za-z_0-9]*\$/.exec(sql.slice(i));
      if (m) {
        quoteTag = m[0];
        buf += m[0];
        i += m[0].length;
        continue;
      }
    }
    if (ch === ";") {
      if (buf.trim().length > 0) yield buf;
      buf = "";
      i++;
      continue;
    }
    buf += ch;
    i++;
  }
  if (buf.trim().length > 0) yield buf;
}

const db = new PGlite();
let totalSections = 0;
let expectedErrorSections = 0;
const failures = [];

for (const rel of files) {
  const content = fs.readFileSync(path.join(root, rel), "utf8");

  // Split into sections on \echo banners; psql meta lines otherwise inactive.
  const sections = [];
  let banner = "";
  let sqlLines = [];
  const flush = () => {
    if (sqlLines.length) sections.push({ banner, sql: sqlLines.join("\n") });
    sqlLines = [];
  };
  for (const raw of content.split("\n")) {
    const t = raw.trim();
    if (t.startsWith("\\echo")) {
      flush();
      const m = /^\\echo\s+'?(.+?)'?;?$/.exec(t);
      banner = m ? m[1] : "";
      continue;
    }
    if (t.startsWith("\\")) continue;
    sqlLines.push(raw);
  }
  flush();

  for (const section of sections) {
    totalSections++;
    const expectsError = /\(expect ERROR/i.test(section.banner);
    let sectionErrors = [];
    for (const stmt of splitStatements(section.sql)) {
      if (!stmt.trim()) continue;
      try {
        await db.query(stmt);
      } catch (e) {
        sectionErrors.push(
          `${e.message}\n    in: ${stmt.split("\n").slice(0, 2).join(" | ").slice(0, 160)}`,
        );
      }
    }
    if (expectsError) {
      expectedErrorSections++;
      if (sectionErrors.length === 0) {
        failures.push(`Section "${section.banner}": expected a guarded ERROR, none raised`);
      }
    } else {
      for (const err of sectionErrors) failures.push(`Section "${section.banner}": ${err}`);
    }
  }
}

console.log(`Sections run: ${totalSections}`);
console.log(`Sections whose guards raised the expected error: ${expectedErrorSections}`);
if (failures.length === 0) {
  console.log("PASS: all statements matched their expected behavior.");
} else {
  for (const f of failures) console.error("FAIL:", f);
  console.error(`\n${failures.length} unexpected outcome(s).`);
  process.exit(1);
}
