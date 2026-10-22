// Shared safety gate + client factory for the EstateOS test-data scripts.
//
// Both scripts/seed-test-data.mjs and scripts/clear-test-data.mjs open their
// Supabase connection through here, and none of these steps can be skipped:
//
//   1. every value is read from .env (plus an optional overlay whose only
//      recognised keys are SEED_ALLOWED_PROJECT_REF and SEED_TEST_PASSWORD),
//   2. the project ref is parsed out of SUPABASE_URL,
//   3. SEED_ALLOWED_PROJECT_REF must equal that ref -- otherwise we refuse
//      before a single request is sent,
//   4. the ref is printed and a human confirms it (unless --yes).
//
// There is no "force" flag and no way to point these scripts at another
// project: SUPABASE_URL and the service-role key can only ever come from
// .env, never from an overlay or from the command line.

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Every address the seed creates ends in this domain. Nothing else is touched. */
export const TEST_EMAIL_DOMAIN = "test.estateos.local";

/** The only agency slug prefix clear-test-data.mjs will ever delete. */
export const TEST_AGENCY_SLUG_PREFIX = "test-";

/**
 * Values that must never reach the terminal -- not in full, not in part, not
 * inside an error message. redact() scrubs all of them from anything printed.
 */
const SECRET_ENV_KEYS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "DATABASE_URL",
  "SEED_TEST_PASSWORD",
];

/** Keys an --env-file overlay is allowed to contribute. */
const OVERLAY_ALLOWED_KEYS = ["SEED_ALLOWED_PROJECT_REF", "SEED_TEST_PASSWORD"];

/** Minimal .env parser (same rules as scripts/apply-migrations.mjs). */
export function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const raw of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i <= 0) continue;
    let value = line.slice(i + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[line.slice(0, i).trim()] = value;
  }
  return out;
}

/** Replaces every secret value with [redacted]. Applied to all error output. */
export function redact(text, secrets) {
  let out = String(text);
  for (const secret of secrets) {
    if (typeof secret === "string" && secret.length >= 6) {
      out = out.split(secret).join("[redacted]");
    }
  }
  return out;
}

/**
 * The project ref is the first label of the Supabase project host, e.g.
 * https://abcdefghijklmnop.supabase.co -> abcdefghijklmnop.
 *
 * A URL that is not a Supabase project host is rejected outright: it would
 * mean the script is pointed at something that is not the project the
 * allow-list is talking about.
 */
export function projectRefOf(supabaseUrl) {
  let parsed;
  try {
    parsed = new URL(supabaseUrl);
  } catch {
    throw new Error("SUPABASE_URL is not a valid URL.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("SUPABASE_URL must be an http(s) URL.");
  }
  const host = parsed.hostname.toLowerCase();
  if (!/\.supabase\.(co|in|net|red)$/.test(host)) {
    throw new Error(`SUPABASE_URL host "${host}" is not a Supabase project host.`);
  }
  const ref = host.split(".")[0];
  if (!/^[a-z0-9]{10,}$/.test(ref)) {
    throw new Error(`Could not read a project ref out of SUPABASE_URL host "${host}".`);
  }
  return { ref, host, url: supabaseUrl };
}

/**
 * Loads configuration. `envFile` defaults to .env and is the ONLY source of
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. `overlayFile` may only add
 * SEED_ALLOWED_PROJECT_REF / SEED_TEST_PASSWORD (handy in CI, and the only
 * reason it exists) -- anything else in it is reported and ignored.
 */
export function loadSeedConfig({ envFile, overlayFile } = {}) {
  const envPath = path.resolve(root, envFile ?? ".env");
  const base = readEnvFile(envPath);
  if (Object.keys(base).length === 0) {
    throw new Error(`No readable .env values found in ${path.relative(root, envPath) || envPath}.`);
  }

  const overlayInfo = { used: [], ignored: [], path: null };
  const values = { ...base };
  if (overlayFile) {
    const overlayPath = path.resolve(root, overlayFile);
    const overlay = readEnvFile(overlayPath);
    overlayInfo.path = overlayPath;
    for (const key of Object.keys(overlay)) {
      if (OVERLAY_ALLOWED_KEYS.includes(key)) {
        values[key] = overlay[key];
        overlayInfo.used.push(key);
      } else {
        overlayInfo.ignored.push(key);
      }
    }
  }
  return { values, envPath, overlay: overlayInfo };
}

/**
 * Same opaque-key handling as src/integrations/supabase/client.server.ts:
 * new-style keys (sb_publishable_... / sb_secret_...) are not JWTs and must be
 * sent in the `apikey` header only, never as a Bearer token.
 */
export function createAdminClient(supabaseUrl, serviceRoleKey) {
  const isNewApiKey = (value) =>
    value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");

  const createSupabaseFetch = (supabaseKey) => (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }
    if (isNewApiKey(supabaseKey) && headers.get("Authorization") === `Bearer ${supabaseKey}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };

  return createClient(supabaseUrl, serviceRoleKey, {
    global: { fetch: createSupabaseFetch(serviceRoleKey) },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

function fail(message) {
  console.error(`\nREFUSING TO RUN: ${message}\n`);
  process.exit(2);
}

/** Prints `present (hidden)` / `missing` -- never the value itself. */
function maskSecrets(values, keys) {
  return keys.map((key) => `  ${key.padEnd(26)} ${values[key] ? "present (hidden)" : "MISSING"}`);
}

/**
 * The whole guard. Returns the service-role client only after the project ref
 * has been matched against the allow-list and confirmed by a human.
 *
 * @param {object} options
 * @param {string} options.scriptName   e.g. "seed-test-data"
 * @param {string[]} options.purpose    extra banner lines describing the run
 * @param {boolean} options.yes         skip the interactive confirmation
 * @param {string} [options.envFile]    defaults to .env
 * @param {string} [options.overlayFile] optional extra keys file
 */
export async function openTestDataClient({
  scriptName,
  purpose = [],
  yes = false,
  envFile,
  overlayFile,
}) {
  const config = loadSeedConfig({ envFile, overlayFile });
  const values = config.values;
  const secrets = SECRET_ENV_KEYS.map((key) => values[key]);
  const relative = (p) => path.relative(root, p) || p;

  // ---- part 1: the safety gate, before anything else ---------------------
  // Only the two values this check needs are required at this point, so a
  // mismatched allow-list is reported as such rather than as a missing key.
  const gateMissing = ["SUPABASE_URL", "SEED_ALLOWED_PROJECT_REF"].filter((key) => !values[key]);
  if (gateMissing.length > 0) {
    fail(`missing required value(s) in ${relative(config.envPath)}: ${gateMissing.join(", ")}.`);
  }

  let target;
  try {
    target = projectRefOf(values.SUPABASE_URL);
  } catch (e) {
    fail(redact(e.message, secrets));
  }
  const allowed = values.SEED_ALLOWED_PROJECT_REF.trim();

  console.log(`\n${scriptName}`);
  for (const line of purpose) console.log(`  ${line}`);
  console.log(`  env file                 ${relative(config.envPath)}`);
  if (config.overlay.path) {
    console.log(`  overlay file             ${relative(config.overlay.path)}`);
    if (config.overlay.ignored.length > 0) {
      console.log(`  overlay keys ignored     ${config.overlay.ignored.join(", ")}`);
    }
  }
  console.log(`  SUPABASE_URL host        ${target.host}`);
  console.log(`  project ref (from URL)   ${target.ref}`);
  console.log(`  allow-list ref           ${allowed}`);
  for (const line of maskSecrets(values, SECRET_ENV_KEYS)) console.log(line);

  if (allowed !== target.ref) {
    fail(
      `SEED_ALLOWED_PROJECT_REF (${allowed}) does not match the project ref in SUPABASE_URL ` +
        `(${target.ref}).\n  This script only ever runs against the allow-listed project. ` +
        "Fix .env and run again.",
    );
  }
  console.log(`  project ref check        MATCH`);

  if (!yes) {
    if (!process.stdin.isTTY) {
      fail(
        "stdin is not a terminal, so the confirmation prompt cannot be answered.\n" +
          "  Re-run with --yes to skip the prompt (the allow-list check above still applies).",
      );
    }
    const answer = await ask(`\nType the project ref to continue: `);
    if (answer !== target.ref) {
      fail(`Confirmation did not match the project ref. Nothing was sent to ${target.host}.`);
    }
  } else {
    console.log(`  confirmation             skipped (--yes)`);
  }

  // ---- part 2: credentials, only now that the project is confirmed --------
  if (!values.SUPABASE_SERVICE_ROLE_KEY) {
    fail(`SUPABASE_SERVICE_ROLE_KEY is missing from ${relative(config.envPath)}.`);
  }

  const supabase = createAdminClient(values.SUPABASE_URL, values.SUPABASE_SERVICE_ROLE_KEY);
  return { supabase, config, values, secrets, target };
}

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/** Wraps a run so every error is redacted before it is printed. */
export async function runGuarded(secrets, fn) {
  try {
    await fn();
  } catch (e) {
    console.error(`\nFAILED: ${redact(e instanceof Error ? e.message : String(e), secrets)}\n`);
    process.exit(1);
  }
}
