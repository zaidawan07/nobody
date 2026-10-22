import assert from "node:assert/strict";
import { test } from "node:test";
import { assessPilotEnv, parseEnv } from "../scripts/lib/pilot-env.mjs";

const base = {
  SUPABASE_URL: "https://udkwbmvrhyeltdjogzjy.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "public-placeholder",
  SUPABASE_SERVICE_ROLE_KEY: "server-placeholder",
  VITE_SUPABASE_URL: "https://udkwbmvrhyeltdjogzjy.supabase.co",
  VITE_SUPABASE_PUBLISHABLE_KEY: "public-placeholder",
  DATABASE_URL: "postgresql://postgres:password@db.udkwbmvrhyeltdjogzjy.supabase.co:5432/postgres",
  WHATSAPP_LIVE_SEND: "false",
  MESSAGING_LIVE_SEND: "false",
};

test("environment parser handles comments, blanks, and quoted values", () => {
  assert.deepEqual(parseEnv('# comment\nA=one\nB="two words"\n\nC=three'), {
    A: "one",
    B: "two words",
    C: "three",
  });
});

test("pilot preflight reports provider integrations pending without leaking values", () => {
  const result = assessPilotEnv(base);
  assert.equal(result.baseReady, true);
  assert.equal(result.liveSendingSafe, true);
  assert.equal(result.meta.ready, false);
  assert.equal(result.ai.ready, false);
  assert.equal(result.cron.ready, false);
  assert.equal(result.errors.length, 0);
  assert.equal(JSON.stringify(result).includes("password"), false);
});

test("pilot preflight rejects Supabase project-reference drift", () => {
  const result = assessPilotEnv({
    ...base,
    VITE_SUPABASE_URL: "https://anotherprojectref.supabase.co",
  });
  assert.equal(result.baseReady, false);
  assert.match(result.errors.join(" "), /project references do not match/i);
});

test("pilot preflight refuses live messaging toggles", () => {
  const result = assessPilotEnv({ ...base, WHATSAPP_LIVE_SEND: "true" });
  assert.equal(result.liveSendingSafe, false);
  assert.match(result.errors.join(" "), /WHATSAPP_LIVE_SEND is enabled/);
});

test("pilot preflight validates WhatsApp encryption key length and cron secret strength", () => {
  const result = assessPilotEnv({
    ...base,
    WHATSAPP_TOKEN_ENCRYPTION_KEY: Buffer.from("too short").toString("base64"),
    CRON_SECRET: "weak",
  });
  assert.match(result.errors.join(" "), /exactly 32 bytes/);
  assert.match(result.errors.join(" "), /at least 32 characters/);
});
