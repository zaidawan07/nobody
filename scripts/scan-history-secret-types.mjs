#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const revisions = process.argv.slice(2);
if (revisions.length === 0) {
  console.error("Usage: node scripts/scan-history-secret-types.mjs <commit:path> [...]");
  process.exit(2);
}

function categories(key, value) {
  const found = [];
  if (/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/.test(value)) {
    found.push("JWT-shaped credential");
  }
  if (/sk-[A-Za-z0-9]{20,}/.test(value)) found.push("API-key-shaped credential");
  if (/sb_secret_[A-Za-z0-9]+/.test(value)) found.push("Supabase secret-key-shaped credential");
  if (/^postgres(?:ql)?:\/\//i.test(value) && /@/.test(value)) {
    found.push("database connection URL");
  }
  if (/(SECRET|TOKEN|PASSWORD|SERVICE_ROLE|API_KEY)/i.test(key) && value.length > 0) {
    found.push("secret-named variable has a value");
  }
  return [...new Set(found)];
}

let findings = 0;
for (const revision of revisions) {
  const result = spawnSync("git", ["show", revision], {
    encoding: "utf8",
    maxBuffer: 5 * 1024 * 1024,
  });
  console.log(`Revision ${revision}: ${result.status === 0 ? "readable" : "not available"}`);
  if (result.status !== 0) continue;
  for (const line of result.stdout.split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    const value = line
      .slice(separator + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
    const matches = categories(key, value);
    if (matches.length) {
      findings++;
      console.log(`  ${key}: ${matches.join(", ")}`);
    }
  }
}
console.log(`Findings reported without values: ${findings}`);
