import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runner = path.join(root, "scripts", "apply-migrations.mjs");
const projectRef = "udkwbmvrhyeltdjogzjy";
const directUrl = `postgresql://postgres:dummy@db.${projectRef}.supabase.co:5432/postgres`;
const poolerUrl = `postgresql://postgres.${projectRef}:dummy@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;

function run(args, databaseUrl) {
  return spawnSync(process.execPath, [runner, ...args], {
    cwd: root,
    encoding: "utf8",
    timeout: 10_000,
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}

test("live Supabase migration runner refuses missing target confirmation", () => {
  const result = run(["--from", "0024"], directUrl);
  assert.equal(result.status, 2, result.stderr || result.stdout);
  assert.match(result.stderr, /without an exact target confirmation/i);
  assert.match(result.stderr, new RegExp(projectRef));
  assert.doesNotMatch(result.stderr, /dummy|postgresql:\/\//i);
});

test("live Supabase migration runner refuses a mismatched project ref", () => {
  const result = run(["--from", "0024", "--confirm-project-ref", "wrongprojectref"], directUrl);
  assert.equal(result.status, 2, result.stderr || result.stdout);
  assert.match(result.stderr, new RegExp(projectRef));
  assert.match(result.stderr, /Review the live schema/i);
});

test("pooled Supabase URLs are guarded by their embedded project ref", () => {
  const result = run(["--from", "0024"], poolerUrl);
  assert.equal(result.status, 2, result.stderr || result.stdout);
  assert.match(result.stderr, new RegExp(projectRef));
  assert.match(result.stderr, /exact target confirmation/i);
});

test("matching project ref alone is not enough without schema-reconciliation acknowledgement", () => {
  const result = run(["--only", "0024", "--confirm-project-ref", projectRef], directUrl);
  assert.equal(result.status, 2, result.stderr || result.stdout);
  assert.match(result.stderr, /--confirm-reconciled-schema/);
  assert.match(result.stderr, /dry run is not a schema diff/i);
});

test("schema acknowledgement alone is not enough without explicit write approval", () => {
  const result = run(
    ["--only", "0024", "--confirm-project-ref", projectRef, "--confirm-reconciled-schema"],
    directUrl,
  );
  assert.equal(result.status, 2, result.stderr || result.stdout);
  assert.match(result.stderr, /--confirm-production-write/);
  assert.match(result.stderr, /explicit written owner approval/i);
});

test("Supabase runner refuses bulk --from batches even when all confirmation flags are present", () => {
  const result = run(
    [
      "--from",
      "0014",
      "--confirm-project-ref",
      projectRef,
      "--confirm-reconciled-schema",
      "--confirm-production-write",
    ],
    directUrl,
  );
  assert.equal(result.status, 2, result.stderr || result.stdout);
  assert.match(result.stderr, /refusing bulk Supabase migration batches/i);
});

test("local dry-run remains connection-free and lists migrations without a ref flag", () => {
  const result = run(["--only", "0024", "--dry-run"], directUrl);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /0024_fix_property_status_guard_search_path\.sql/);
  assert.doesNotMatch(result.stdout, /Applying .*transaction/i);
});
