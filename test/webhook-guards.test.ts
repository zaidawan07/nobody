import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_WEBHOOK_BODY_BYTES,
  parseWebhookPayload,
  readBoundedWebhookBody,
  webhookPreflight,
} from "../src/lib/webhook-guards";

const headers = (entries: Record<string, string>) => new Headers(entries);

test("webhook without a signature header is rejected before the body is read", () => {
  const result = webhookPreflight(headers({}));
  assert.deepEqual(result, { ok: false, status: 401, reason: "Missing signature" });
});

test("webhook declaring an oversized body is rejected with 413", () => {
  const result = webhookPreflight(
    headers({
      "x-hub-signature-256": "sha256=" + "a".repeat(64),
      "content-length": String(MAX_WEBHOOK_BODY_BYTES + 1),
    }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 413);
});

test("webhook with a malformed content-length is rejected with 400", () => {
  for (const bad of ["abc", "-5"]) {
    const result = webhookPreflight(
      headers({ "x-hub-signature-256": "sha256=" + "a".repeat(64), "content-length": bad }),
    );
    assert.equal(result.ok, false, bad);
    if (!result.ok) assert.equal(result.status, 400, bad);
  }
});

test("signed webhook of normal size passes preflight, with or without content-length", () => {
  const sig = "sha256=" + "a".repeat(64);
  assert.deepEqual(webhookPreflight(headers({ "x-hub-signature-256": sig })), { ok: true });
  assert.deepEqual(
    webhookPreflight(headers({ "x-hub-signature-256": sig, "content-length": "2048" })),
    { ok: true },
  );
});

test("chunked webhook bodies are bounded while streaming", async () => {
  const withinLimit = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("{"));
      controller.enqueue(new TextEncoder().encode('"ok":true}'));
      controller.close();
    },
  });
  assert.equal(await readBoundedWebhookBody(withinLimit), '{"ok":true}');

  let cancelled = false;
  const overLimit = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new Uint8Array(MAX_WEBHOOK_BODY_BYTES));
      controller.enqueue(new Uint8Array(1));
    },
    cancel() {
      cancelled = true;
    },
  });
  assert.equal(await readBoundedWebhookBody(overLimit), null);
  assert.equal(cancelled, true);

  // Multi-byte characters are measured as encoded bytes, not JS code units.
  const multibyte = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("é".repeat(MAX_WEBHOOK_BODY_BYTES / 2 + 1)));
      controller.close();
    },
  });
  assert.equal(await readBoundedWebhookBody(multibyte), null);
});

test("webhook body at the exact byte limit is accepted", async () => {
  const exactLimit = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(MAX_WEBHOOK_BODY_BYTES));
      controller.close();
    },
  });
  assert.equal((await readBoundedWebhookBody(exactLimit))?.length, MAX_WEBHOOK_BODY_BYTES);
});

test("malformed JSON and non-object payloads are rejected without throwing", () => {
  assert.equal(parseWebhookPayload("{"), null);
  assert.equal(parseWebhookPayload("null"), null);
  assert.equal(parseWebhookPayload("[]"), null);
  assert.deepEqual(parseWebhookPayload('{"object":"whatsapp_business_account"}'), {
    object: "whatsapp_business_account",
  });
});
