// Source-level contract tests. They do not run the routes (that needs live Supabase,
// Meta and Twilio); they stop the specific safety behaviours below being deleted by accident.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("SMS check-in cron claims a row before it sends (no duplicate SMS)", () => {
  const source = read("src/routes/api/cron/property-checkins.ts");
  const claim = source.indexOf('.update({ provider_error: "sending" })');
  const send = source.indexOf("await sendCheckinMessage(");
  assert.ok(claim > 0, "claim step is missing");
  assert.ok(send > claim, "the send must come after the claim");
  assert.match(source, /\.is\("provider_error", null\)/);
  assert.match(source, /MESSAGING_LIVE_SEND/);
});

test("WhatsApp webhook cancels queued follow-ups when a customer opts out", () => {
  const source = read("src/routes/api/whatsapp/webhook.ts");
  const optOut = source.indexOf('intent === "opt_out"');
  const cancel = source.indexOf('status: "cancelled"');
  assert.ok(optOut > 0 && cancel > optOut, "opt-out must cancel scheduled follow-ups");
  assert.match(source, /whatsapp_scheduled_followups/);
});

test("WhatsApp webhook verifies the Meta signature before parsing the body", () => {
  const source = read("src/routes/api/whatsapp/webhook.ts");
  assert.match(source, /readBoundedWebhookBody\(request\.body\)/);
  const verify = source.indexOf("verifyMetaSignature(raw");
  const parse = source.indexOf("parseWebhookPayload(raw)");
  assert.ok(verify > 0 && parse > verify, "signature must be checked before JSON.parse");
  assert.match(source, /return new Response\("Invalid JSON", \{ status: 400 \}\)/);
  assert.match(source, /return Response\.json\(\{ ok: false \}, \{ status: 500 \}\)/);
});

test("delivery receipts stay connection-scoped and retry if persistence fails", () => {
  const source = read("src/routes/api/whatsapp/webhook.ts");
  const receiptBlock = source.slice(source.indexOf("for (const status of value.statuses ?? [])"));
  assert.match(receiptBlock, /\.eq\("connection_id", connection\.id\)/);
  assert.match(
    receiptBlock,
    /if \(statusUpdateError\) throw new Error\("Could not persist WhatsApp delivery status\."\)/,
  );
  assert.match(receiptBlock, /statusUpdateError\?\.code === "23514"/);
  assert.match(receiptBlock, /Message delivery failed; review status in Meta/);
});

test("failed super-admin role creation releases only the caller's bootstrap claim", () => {
  const source = read("src/lib/access.functions.ts");
  const start = source.indexOf("export const claimSuperAdmin");
  const roleInsert = source.indexOf('.from("user_roles")', start);
  const cleanup = source.indexOf(
    '.from("platform_bootstrap").delete().eq("claimed_by", context.userId)',
    roleInsert,
  );
  assert.ok(
    roleInsert > 0 && cleanup > roleInsert,
    "failed role creation must compensate its own claim",
  );
});

test("server functions do not forward raw provider or database error messages", () => {
  const library = new URL("../src/lib/", import.meta.url);
  const paths = readdirSync(library)
    .filter((name) => name.endsWith(".functions.ts"))
    .map((name) => new URL(name, library));
  paths.push(
    new URL("../src/lib/whatsapp-meta.server.ts", import.meta.url),
    new URL("../src/lib/messaging.server.ts", import.meta.url),
    new URL("../src/lib/plan-limits.server.ts", import.meta.url),
  );
  for (const path of paths) {
    const source = readFileSync(path, "utf8");
    assert.doesNotMatch(
      source,
      /throw new Error\([^\n]*(?:error|Error)\??\.message/,
      `${path.pathname} must not return provider/database error text to callers`,
    );
  }
});

test("staging webhook smoke requires explicit HTTPS staging confirmation and never enables sending", () => {
  const source = read("scripts/staging/whatsapp-webhook-smoke.mjs");
  assert.match(source, /ESTATEOS_STAGING_MUTATION_ACK/);
  assert.match(source, /I_CONFIRM_STAGING_TEST_DATA_WRITES/);
  assert.match(source, /base\.protocol !== "https:"/);
  assert.match(source, /base\.hostname !== env\.ESTATEOS_STAGING_HOST_CONFIRM/);
  assert.match(source, /\(staging\|stage\|preview\|test\)/);
  assert.match(source, /ESTATEOS_STAGING_PROJECT_REF/);
  assert.match(source, /ESTATEOS_PRODUCTION_PROJECT_REF/);
  assert.match(source, /identity\?\.environment !== "staging"/);
  assert.equal((source.match(/redirect: "error"/g) ?? []).length, 3);
  assert.ok(
    source.indexOf("const identityResponse = await fetch(identityEndpoint") <
      source.indexOf('postWebhook("missing signature rejected"'),
    "runtime identity must be checked before the first webhook request",
  );
  assert.match(source, /scheduler rejects unauthenticated request/);
  assert.doesNotMatch(source, /WHATSAPP_LIVE_SEND\s*=\s*["']true/);
  assert.doesNotMatch(source, /console\.(?:log|error)\([^\n]*(?:META_APP_SECRET|CRON_SECRET)/);
});

test("staging identity route returns no deployment details outside explicit staging", () => {
  const source = read("src/routes/api/staging/identity.ts");
  assert.match(source, /ESTATEOS_DEPLOYMENT_ENV.*!== "staging"/);
  assert.match(source, /\{ ok: false \}[\s\S]{0,100}status: 404/);
  assert.match(source, /supabaseProjectRef: projectRef/);
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|META_APP_SECRET|CRON_SECRET/);
});

test("WhatsApp assignment is agency-admin-only and validates active same-agency employee", () => {
  const source = read("src/lib/whatsapp.functions.ts");
  const start = source.indexOf("export const assignWhatsappConversation");
  const end = source.indexOf("const consentInput", start);
  const assignment = source.slice(start, end);
  assert.match(assignment, /requireAgencyAdmin\(context\.supabase, context\.userId\)/);
  assert.match(assignment, /\.eq\("agency_id", agencyId\)/);
  assert.match(assignment, /\.eq\("role", "employee"\)/);
  assert.match(assignment, /\.eq\("status", "active"\)/);
  assert.match(assignment, /\.eq\("id", data\.conversationId\)/);
  assert.match(assignment, /current\.assigned_to[\s\S]*?updateQuery\.is\("assigned_to", null\)/);
  assert.match(assignment, /updated\.assigned_to !== current\.assigned_to/);
});

test("WhatsApp employee inbox and reply are restricted to assigned conversations", () => {
  const source = read("src/lib/whatsapp.functions.ts");
  assert.match(
    source,
    /if \(membership\.role === "employee"\) query = query\.eq\("assigned_to", context\.userId\)/,
  );
  assert.match(
    source,
    /if \(role === "employee"\)\s+conversationQuery = conversationQuery\.eq\("assigned_to", context\.userId\)/,
  );
  assert.match(
    source,
    /if \(membership\.role === "employee"\) query = query\.eq\("assigned_to", userId\)/,
  );
  assert.match(source, /function getAccessibleWhatsappConversation/);
  assert.match(source, /\.from\("profiles"\)[\s\S]*?\.eq\("status", "active"\)/);
  assert.equal((source.match(/profile\.agency_id !== data\.agency_id/g) ?? []).length, 2);
});

test("WhatsApp membership rejects inactive, missing-role, and cross-agency accounts", () => {
  const source = read("src/lib/whatsapp.functions.ts");
  const membership = source.slice(
    source.indexOf("async function getWhatsappMembership"),
    source.indexOf("async function getAccessibleWhatsappConversation"),
  );
  assert.match(membership, /\.eq\("status", "active"\)/);
  assert.match(membership, /\.in\("role", \["agency_admin", "employee"\]\)/);
  assert.match(membership, /profile\.agency_id !== data\.agency_id/);
  assert.match(membership, /!\["agency_admin", "employee"\]\.includes\(data\.role\)/);
});

test("WhatsApp conversation access denies cross-agency and unassigned employee IDs", () => {
  const source = read("src/lib/whatsapp.functions.ts");
  const access = source.slice(
    source.indexOf("async function getAccessibleWhatsappConversation"),
    source.indexOf("async function requireAgencyAdmin"),
  );
  assert.match(access, /\.eq\("id", conversationId\)/);
  assert.match(access, /\.eq\("agency_id", membership\.agencyId\)/);
  assert.match(
    access,
    /if \(membership\.role === "employee"\) query = query\.eq\("assigned_to", userId\)/,
  );
  assert.match(access, /if \(error \|\| !data\) throw new Error/);
});

test("WhatsApp reassignment is admin-only and checks current assignment atomically", () => {
  const source = read("src/lib/whatsapp.functions.ts");
  const start = source.indexOf("export const assignWhatsappConversation");
  const end = source.indexOf("const consentInput", start);
  const assignment = source.slice(start, end);
  assert.match(assignment, /requireAgencyAdmin\(context\.supabase, context\.userId\)/);
  assert.match(assignment, /\.eq\("agency_id", agencyId\)/);
  assert.match(assignment, /\.eq\("role", "employee"\)/);
  assert.match(assignment, /\.eq\("status", "active"\)/);
  assert.match(assignment, /current\.assigned_to[\s\S]*?updateQuery\.is\("assigned_to", null\)/);
  assert.match(assignment, /updated\.assigned_to !== current\.assigned_to/);
});

test("AI provider failure leaves the conversation paused for a human", () => {
  const source = read("src/routes/api/whatsapp/webhook.ts");
  assert.match(source, /Automated reply failed; a human agent should follow up\./);
  assert.match(source, /ai_paused_at: new Date\(\)\.toISOString\(\)/);
  assert.match(source, /WHATSAPP_LIVE_SEND"\] === "true"/);
});

test("webhook handoff and AI failure states are not acknowledged before persistence", () => {
  const source = read("src/routes/api/whatsapp/webhook.ts");
  assert.match(
    source,
    /if \(handoffError\) throw new Error\("Could not save the human handoff state\."\)/,
  );
  assert.match(source, /if \(failedMessageError \|\| pausedConversationError\)/);
  assert.match(source, /Could not save the automatic-reply failure for human review/);
  assert.match(source, /Could not save the automatic-reply review state/);
  assert.match(
    source,
    /if \(processedError\) throw new Error\("Could not mark the webhook event processed\."\)/,
  );
  assert.match(source, /if \(outboundError\?\.code !== "23505"\)/);
});

test("uncertain AI sends are reserved once and never invoked again on webhook retry", () => {
  const source = read("src/routes/api/whatsapp/webhook.ts");
  const reserve = source.indexOf("idempotency_key: outboundKey");
  const provider = source.indexOf("const reply = await generateReply", reserve);
  const duplicate = source.indexOf("} else {\n                // An event retry", provider);
  assert.ok(reserve > 0 && provider > reserve && duplicate > provider);
  const duplicateBranch = source.slice(duplicate);
  assert.match(duplicateBranch, /\.eq\("idempotency_key", outboundKey\)/);
  assert.match(duplicateBranch, /Automatic reply outcome is uncertain; a human must review it\./);
  assert.doesNotMatch(
    duplicateBranch.slice(0, duplicateBranch.indexOf("const { error: processedError")),
    /generateReply|sendMetaTextMessage/,
  );
  assert.match(
    source,
    /if \(failedMessageError \|\| pausedConversationError\)[\s\S]*?Could not save the automatic-reply failure/,
  );
  assert.match(
    source,
    /if \(processedError\) throw new Error\("Could not mark the webhook event processed\."\)/,
  );
});

test("follow-up cron stays disabled unless live sending is explicitly enabled", () => {
  const source = read("src/routes/api/cron/whatsapp-followups.ts");
  assert.match(source, /WHATSAPP_LIVE_SEND"\] !== "true"/);
  assert.match(source, /authenticateCronRequest/);
});

test("follow-up cron never auto-retries permanent failures", () => {
  const source = read("src/routes/api/cron/whatsapp-followups.ts");
  assert.match(source, /error instanceof PermanentFollowupError/);
  assert.match(source, /throw new PermanentFollowupError\("Customer WhatsApp opt-in/);
});

test("follow-up scheduler claims jobs with compare-and-set state before processing", () => {
  const source = read("src/routes/api/cron/whatsapp-followups.ts");
  const claim = source.indexOf('.update({\n              status: "processing"');
  const processing = source.indexOf("let outboundId", claim);
  assert.ok(claim > 0 && processing > claim, "claim must occur before send preparation");
  const claimBlock = source.slice(claim, processing);
  assert.match(claimBlock, /\.eq\("id", item\.id\)/);
  assert.match(claimBlock, /\.eq\("status", item\.status\)/);
  assert.match(claimBlock, /if \(!claimed\) continue/);
});
