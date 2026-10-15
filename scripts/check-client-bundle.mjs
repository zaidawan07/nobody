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

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, ".output", "public");

if (!fs.existsSync(publicDir)) {
  console.error(
    `No build output at ${path.relative(root, publicDir)}. Run \`npm run build\` first.`,
  );
  process.exit(2);
}

// Read the service-role key name from the environment to compare against, but
// never print its value: if the secret is present anywhere in the bundle we
// report the FILE and the fact, not the secret itself.
const serviceRoleKey = (process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "").trim();

// Substrings that must never appear in a browser-served asset. The first two
// are structural (a path that only exists server-side); the rest are env names
// and, when configured, the actual secret.
const forbidden = [
  { label: "client.server import path", needle: "integrations/supabase/client.server" },
  { label: "SUPABASE_SERVICE_ROLE_KEY name", needle: "SUPABASE_SERVICE_ROLE_KEY" },
  { label: "service_role key value (from env)", needle: serviceRoleKey, onlyIf: serviceRoleKey.length > 0 },
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
  for (const rule of forbidden) {
    // An empty needle would match every file, so treat it as absent.
    if (!rule.needle) continue;
    if (rule.onlyIf && rule.needle.length === 0) continue;
    if (text.includes(rule.needle)) {
      hits++;
      // Report location only. Never reproduce the matched text when it is a secret.
      findings.push(
        `  ${path.relative(root, file)} contains ${rule.label}` +
          (rule.needle === serviceRoleKey && serviceRoleKey ? " (value not shown)" : ` "${rule.needle}"`),
      );
    }
  }
}

console.log(`check-client-bundle: scanned ${scanned} asset(s) under .output/public`);
if (serviceRoleKey) console.log("  (env SUPABASE_SERVICE_ROLE_KEY is set, so its value was also checked)");
else console.log("  (SUPABASE_SERVICE_ROLE_KEY is not set in this environment; value check skipped)");

if (hits > 0) {
  console.error(`\nFAIL: ${hits} forbidden reference(s) in the client bundle:`);
  for (const f of findings) console.error(f);
  console.error("\nThe service-role client must never reach the browser.");
  process.exit(1);
}

console.log("PASS: no server-only client, key name, or key value in the client bundle.");
