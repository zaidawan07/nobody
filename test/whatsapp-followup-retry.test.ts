import assert from "node:assert/strict";
import { test } from "node:test";
import { getSafeFollowupRetryAt } from "../src/lib/whatsapp-followup-retry";

const now = Date.UTC(2026, 0, 1);

test("safe follow-up retries use increasing one and two minute backoff", () => {
  assert.equal(getSafeFollowupRetryAt(1, now)?.getTime(), now + 60_000);
  assert.equal(getSafeFollowupRetryAt(2, now)?.getTime(), now + 120_000);
});

test("safe follow-up retries stop after three claimed attempts", () => {
  assert.equal(getSafeFollowupRetryAt(3, now), null);
  assert.equal(getSafeFollowupRetryAt(0, now), null);
  assert.equal(getSafeFollowupRetryAt(-1, now), null);
  assert.equal(getSafeFollowupRetryAt(1.5, now), null);
});
