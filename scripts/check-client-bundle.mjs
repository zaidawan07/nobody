// Guards against the service-role client (or its secret) leaking into the
// browser bundle. Run after `npm run build`; exits non-zero if the client
// output contains anything that must never ship to a browser.
//
// Usage: node scripts/check-client-bundle.mjs
//
// Why this exists: `client.server.ts` holds SUPABASE_SERVICE_ROLE_KEY, which
// bypasses RLS. It is deliberately only reachable through a dynamic import
// inside a server handler, so a static import from a route or component would
// silently pull it into the client bundle. This script is the tripwire.
//
// Secret handling: the script reads the service-role key and the database
// password from the LOCAL .env file (and from process.env, which wins), then
// searches the built client assets for those exact values. Values are only ever
// compared in memory -- they are never printed, logged, echoed, or written
// anywhere, including in the failure output. A hit reports the FILE and which
// secret it was, never the secret.
//
// Test hooks (both optional, used by the repo's own smoke check):
//   BUNDLE_CHECK_ENV_FILE   path to an alternate .env-like file
//   BUNDLE_CHECK_PUBLIC_DIR path to an alternate client output directory

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = process.env["BUNDLE_CHECK_PUBLIC_DIR"]
  ? path.resolve(process.env["BUNDLE_CHECK_PUBLIC_DIR"])
  : path.join(root, ".output", "public");
const envFile = process.env["BUNDLE_CHECK_ENV_FILE"]
  ? path.resolve(process.env["BUNDLE_CHECK_ENV_FILE"])
  : path.join(root, ".env");

if (!fs.existsSync(publicDir)) {
  console.error(
    `No build output at ${path.relative(root, publicDir)}. Run \`npm run build\` first.`,
  );
  process.exit(2);
}

// ---------------------------------------------------------------------------
// .env parsing (names and values stay in memory; nothing here is printed)
// ---------------------------------------------------------------------------

/** Minimal dotenv reader: KEY=VALUE, optional quotes, `export`, `#` comments. */
function parseEnvFile(file) {
  const out = new Map();
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return out;
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(trimmed);
    if (!m) continue;
    let value = m[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    out.set(m[1], value);
  }
  return out;
}

const fileEnv = parseEnvFile(envFile);
/**
 * process.env wins over the file, BUT only when it is actually set to something.
 * A defined-but-empty variable (common in CI, and how this repo's own tests
 * neutralise the real secrets) must fall through to the .env file rather than
 * blanking it out.
 */
const env = (name) => {
  const fromProcess = (process.env[name] ?? "").trim();
  if (fromProcess) return fromProcess;
  return (fileEnv.get(name) ?? "").trim();
};

/** Pull the password out of a postgres:// connection string, if present. */
function passwordFromDatabaseUrl(url) {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    if (parsed.password) return decodeURIComponent(parsed.password);
  } catch {
    // Fall through to the regex for URLs `new URL` will not accept.
  }
  const m = /^[a-z]+:\/\/[^:/@]+:([^@]*)@/i.exec(url);
  if (!m) return "";
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

// A very short value (a 3-character password, say) matches random minified code
// and would drown the check in false positives, so those are reported as
// skipped rather than silently ignored.
const MIN_SECRET_LEN = 8;

const secretCandidates = [
  {
    label: "service_role key (.env SUPABASE_SERVICE_ROLE_KEY)",
    value: env("SUPABASE_SERVICE_ROLE_KEY"),
  },
  {
    label: "database password (.env DATABASE_URL)",
    value: passwordFromDatabaseUrl(env("DATABASE_URL")),
  },
  { label: "database password (.env SUPABASE_DB_PASSWORD)", value: env("SUPABASE_DB_PASSWORD") },
];

const secrets = [];
const skipped = [];
for (const c of secretCandidates) {
  if (!c.value) continue;
  if (c.value.length < MIN_SECRET_LEN) {
    skipped.push(c.label);
    continue;
  }
  // De-duplicate: DATABASE_URL and SUPABASE_DB_PASSWORD often hold the same value.
  if (secrets.some((s) => s.value === c.value)) continue;
  secrets.push(c);
}

// ---------------------------------------------------------------------------
// Structural rules: strings that are proof of a leak on their own.
// ---------------------------------------------------------------------------

const forbidden = [
  { label: "client.server import path", needle: "integrations/supabase/client.server" },
  { label: "SUPABASE_SERVICE_ROLE_KEY name", needle: "SUPABASE_SERVICE_ROLE_KEY" },
];

const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(p);
      continue;
    }
    // Only text assets can leak a string; skip images/fonts/archives.
    if (/\.(js|mjs|cjs|html|json|css|map|txt)$/.test(entry.name)) files.push(p);
  }
})(publicDir);

let scanned = 0;
let hits = 0;
const findings = [];

for (const file of files) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    continue; // binary-ish asset that passed the extension filter
  }
  scanned++;
  const rel = path.relative(root, file);
  for (const rule of forbidden) {
    if (text.includes(rule.needle)) {
      hits++;
      findings.push(`  ${rel} contains ${rule.label} "${rule.needle}"`);
    }
  }
  for (const secret of secrets) {
    if (text.includes(secret.value)) {
      hits++;
      // Never reproduce the matched text when it is a secret.
      findings.push(`  ${rel} contains ${secret.label} -- value not shown`);
    }
  }
}

console.log(
  `check-client-bundle: scanned ${scanned} asset(s) under ${path.relative(root, publicDir)}`,
);
console.log(
  `  secrets compared: ${secrets.length} (${secrets.map((s) => s.label).join(", ") || "none"})`,
);
if (skipped.length > 0) {
  console.log(
    `  skipped as too short to scan (${MIN_SECRET_LEN} chars min): ${skipped.join(", ")}`,
  );
}

if (hits > 0) {
  console.error(`\nFAIL: ${hits} forbidden reference(s) in the client bundle:`);
  for (const f of findings) console.error(f);
  console.error("\nThe service-role client and its secrets must never reach the browser.");
  process.exit(1);
}

console.log("PASS: no server-only client, key name, or secret value in the client bundle.");
