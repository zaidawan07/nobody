#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assessPilotEnv, parseEnv } from "./lib/pilot-env.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(root, ".env");
const fileValues = fs.existsSync(envFile) ? parseEnv(fs.readFileSync(envFile, "utf8")) : {};
const env = { ...fileValues, ...process.env };
const result = assessPilotEnv(env);

function show(name, ready, missing = []) {
  const status = ready ? "READY" : "PENDING";
  console.log(`${name}: ${status}${missing.length ? ` (missing: ${missing.join(", ")})` : ""}`);
}

show("Base app/database configuration", result.baseReady, result.missingBase);
show("Meta WhatsApp integration", result.meta.ready, result.meta.missing);
show("AI replies", result.ai.ready, result.ai.missing);
show("Authenticated scheduler", result.cron.ready, result.cron.missing);
show("Invitation email delivery", result.email.ready);
show("Automated/live messaging disabled", result.liveSendingSafe);

for (const warning of result.warnings) console.warn(`WARNING: ${warning}`);
for (const error of result.errors) console.error(`ERROR: ${error}`);

if (result.errors.length || !result.baseReady) process.exitCode = 1;
else if (!result.meta.ready || !result.ai.ready || !result.cron.ready) {
  console.log("Provider integrations remain pending.");
}
console.log("Configuration-only preflight; no database or provider requests were made.");
