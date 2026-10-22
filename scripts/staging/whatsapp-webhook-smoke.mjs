import { createHmac, randomUUID } from "node:crypto";

const env = process.env;
const required = [
  "ESTATEOS_STAGING_URL",
  "ESTATEOS_STAGING_HOST_CONFIRM",
  "ESTATEOS_STAGING_MUTATION_ACK",
  "ESTATEOS_STAGING_PROJECT_REF",
  "ESTATEOS_PRODUCTION_PROJECT_REF",
  "META_APP_SECRET",
  "ESTATEOS_TEST_WABA_ID",
  "ESTATEOS_TEST_PHONE_NUMBER_ID",
  "ESTATEOS_TEST_WA_ID",
];
const missing = required.filter((key) => !env[key]?.trim());
if (missing.length) {
  console.error(`Missing required environment names: ${missing.join(", ")}`);
  process.exit(2);
}

let base;
try {
  base = new URL(env.ESTATEOS_STAGING_URL);
} catch {
  console.error("Safety check failed: ESTATEOS_STAGING_URL must be a valid HTTPS staging origin.");
  process.exit(2);
}
if (
  base.protocol !== "https:" ||
  base.username ||
  base.password ||
  base.search ||
  base.hash ||
  base.hostname !== env.ESTATEOS_STAGING_HOST_CONFIRM ||
  !/(^|[.-])(staging|stage|preview|test)([.-]|$)/i.test(base.hostname) ||
  !/^[a-z0-9-]{8,40}$/i.test(env.ESTATEOS_STAGING_PROJECT_REF) ||
  !/^[a-z0-9-]{8,40}$/i.test(env.ESTATEOS_PRODUCTION_PROJECT_REF) ||
  env.ESTATEOS_STAGING_PROJECT_REF === env.ESTATEOS_PRODUCTION_PROJECT_REF ||
  env.ESTATEOS_STAGING_MUTATION_ACK !== "I_CONFIRM_STAGING_TEST_DATA_WRITES"
) {
  console.error(
    "Safety check failed: confirm an HTTPS staging host and staging-write acknowledgement.",
  );
  process.exit(2);
}

const wabaId = env.ESTATEOS_TEST_WABA_ID;
const phoneNumberId = env.ESTATEOS_TEST_PHONE_NUMBER_ID;
const customerWaId = env.ESTATEOS_TEST_WA_ID;
if (![wabaId, phoneNumberId, customerWaId].every((value) => /^\d{5,30}$/.test(value))) {
  console.error(
    "Test WABA, phone-number, and WhatsApp recipient IDs must be numeric provider test IDs.",
  );
  process.exit(2);
}

const endpoint = new URL("/api/whatsapp/webhook", base.origin);
const cronEndpoint = new URL("/api/cron/whatsapp-followups", base.origin);
const identityEndpoint = new URL("/api/staging/identity", base.origin);
const secret = env.META_APP_SECRET;
const signature = (raw) => `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
const results = [];
const testSuffix = randomUUID().replaceAll("-", "");

async function postWebhook(label, raw, mode = "valid", expected = 200) {
  const headers = { "content-type": "application/json" };
  if (mode !== "missing") {
    const validSignature = signature(raw);
    headers["x-hub-signature-256"] =
      mode === "invalid" ? `sha256=${"0".repeat(64)}` : validSignature;
  }
  const response = await fetch(endpoint, {
    method: "POST",
    redirect: "error",
    headers,
    body: raw,
    signal: AbortSignal.timeout(15_000),
  });
  results.push({ label, status: response.status, expected });
  if (response.status !== expected) {
    throw new Error(`${label}: expected HTTP ${expected}, received ${response.status}`);
  }
}

function metaPayload(field, value) {
  return JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ id: wabaId, changes: [{ field, value }] }],
  });
}

try {
  const identityResponse = await fetch(identityEndpoint, {
    method: "GET",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  const identity = await identityResponse.json().catch(() => null);
  if (
    identityResponse.status !== 200 ||
    identity?.environment !== "staging" ||
    identity?.supabaseProjectRef !== env.ESTATEOS_STAGING_PROJECT_REF ||
    identity?.supabaseProjectRef === env.ESTATEOS_PRODUCTION_PROJECT_REF
  ) {
    throw new Error("Target identity check failed; no webhook or scheduler requests were sent.");
  }

  const probe = JSON.stringify({ object: "unrecognized_test_object" });
  await postWebhook("missing signature rejected", probe, "missing", 401);
  await postWebhook("invalid signature rejected", probe, "invalid", 401);
  await postWebhook("signed malformed JSON rejected", "{", "valid", 400);
  await postWebhook("signed unknown object acknowledged", probe, "valid", 200);

  const messageId = `wamid.EstateOSInbound${testSuffix}`;
  const echoId = `wamid.EstateOSEcho${testSuffix}`;
  const handoffId = `wamid.EstateOSHandoff${testSuffix}`;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const inbound = metaPayload("messages", {
    metadata: { phone_number_id: phoneNumberId },
    contacts: [{ wa_id: customerWaId, profile: { name: "EstateOS Staging Test" } }],
    messages: [
      {
        id: messageId,
        from: customerWaId,
        timestamp,
        type: "text",
        text: { body: `EstateOS staging smoke ${testSuffix}` },
      },
    ],
  });
  await postWebhook("inbound test message accepted", inbound);
  await postWebhook("duplicate inbound event acknowledged", inbound);

  const handoff = metaPayload("messages", {
    metadata: { phone_number_id: phoneNumberId },
    contacts: [{ wa_id: customerWaId, profile: { name: "EstateOS Staging Test" } }],
    messages: [
      {
        id: handoffId,
        from: customerWaId,
        timestamp,
        type: "text",
        text: { body: `human please ${testSuffix}` },
      },
    ],
  });
  await postWebhook("human handoff keyword accepted", handoff);

  const echo = metaPayload("smb_message_echoes", {
    metadata: { phone_number_id: phoneNumberId },
    message_echoes: [
      {
        id: echoId,
        to: customerWaId,
        timestamp,
        type: "text",
        text: { body: `EstateOS staging echo ${testSuffix}` },
      },
    ],
  });
  await postWebhook("agent echo accepted", echo);
  await postWebhook("duplicate agent echo acknowledged", echo);

  const status = (value) =>
    metaPayload("messages", {
      metadata: { phone_number_id: phoneNumberId },
      statuses: [{ id: echoId, status: value, timestamp }],
    });
  await postWebhook("read receipt accepted", status("read"));
  await postWebhook("late stale sent receipt safely acknowledged", status("sent"));

  const stopMessage = metaPayload("messages", {
    metadata: { phone_number_id: phoneNumberId },
    contacts: [{ wa_id: customerWaId, profile: { name: "EstateOS Staging Test" } }],
    messages: [
      {
        id: `wamid.EstateOSStop${testSuffix}`,
        from: customerWaId,
        timestamp,
        type: "text",
        text: { body: "STOP" },
      },
    ],
  });
  await postWebhook("STOP request accepted", stopMessage);

  const cronResponse = await fetch(cronEndpoint, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  results.push({
    label: "scheduler rejects unauthenticated request",
    status: cronResponse.status,
    expected: 401,
  });
  if (cronResponse.status !== 401) {
    throw new Error(`scheduler auth probe: expected HTTP 401, received ${cronResponse.status}`);
  }

  for (const result of results) console.log(`PASS ${result.label}: HTTP ${result.status}`);
  console.log(`Test reference: ${testSuffix}`);
  console.log("Review the runbook's read-only staging checks for persisted rows and tenant scope.");
} catch (error) {
  for (const result of results) {
    const state = result.status === result.expected ? "PASS" : "FAIL";
    console.log(`${state} ${result.label}: HTTP ${result.status} (expected ${result.expected})`);
  }
  console.error(error instanceof Error ? error.message : "Staging smoke failed.");
  console.error(`Test reference for safe staging cleanup: ${testSuffix}`);
  process.exitCode = 1;
}
