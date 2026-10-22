import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import {
  getMetaAccountUpdateState,
  META_ACCOUNT_UPDATE_ELIGIBLE_STATES,
  verifyMetaSignature,
} from "../src/lib/whatsapp-meta.server";

test("Meta offboarding disconnects active and degraded connections", () => {
  assert.deepEqual(META_ACCOUNT_UPDATE_ELIGIBLE_STATES, ["connected", "attention_required"]);
  assert.equal(getMetaAccountUpdateState("ACCOUNT_OFFBOARDED"), "disconnected");
  assert.equal(getMetaAccountUpdateState("PARTNER_REMOVED"), "disconnected");
});

test("unknown Meta account updates require attention instead of remaining sendable", () => {
  assert.equal(getMetaAccountUpdateState("UNKNOWN_EVENT"), "attention_required");
  assert.equal(getMetaAccountUpdateState(""), "attention_required");
});

test("Meta webhook signature accepts the exact raw body and rejects altered or malformed signatures", async () => {
  const previousSecret = process.env["META_APP_SECRET"];
  const secret = "local-test-secret-never-used-for-provider-access";
  const rawBody = '{"object":"whatsapp_business_account"}';
  process.env["META_APP_SECRET"] = secret;
  try {
    const digest = createHmac("sha256", secret).update(rawBody).digest("hex");
    assert.equal(await verifyMetaSignature(rawBody, `sha256=${digest}`), true);
    assert.equal(await verifyMetaSignature(`${rawBody} `, `sha256=${digest}`), false);
    assert.equal(await verifyMetaSignature(rawBody, "sha256=not-a-digest"), false);
    assert.equal(await verifyMetaSignature(rawBody, null), false);
  } finally {
    if (previousSecret === undefined) delete process.env["META_APP_SECRET"];
    else process.env["META_APP_SECRET"] = previousSecret;
  }
});
