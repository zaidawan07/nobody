import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyInboundIntent, INBOUND_TYPES_NEEDING_HUMAN } from "../src/lib/whatsapp-optout";
import { PermanentFollowupError, getSafeFollowupRetryAt } from "../src/lib/whatsapp-followup-retry";

test("clear stop requests are opt-outs, regardless of case and punctuation", () => {
  for (const text of [
    "STOP",
    "Stop.",
    "  stop all  ",
    "Unsubscribe!",
    "please stop",
    "Please stop.",
    "stop messaging me",
    "Stop sending messages",
    "Opt-out",
    "opt out",
    "do not message me",
    "Don’t message me",
    "remove me",
    "band karo",
    "Mat bhejo!",
  ]) {
    assert.equal(classifyInboundIntent(text), "opt_out", text);
  }
});

test("stop inside a longer sentence is flagged for a human, not treated as an opt-out", () => {
  for (const text of [
    "Please stop sending me these messages about plots",
    "stop by tomorrow to see the house",
    "this is spam",
  ]) {
    assert.equal(classifyInboundIntent(text), "review", text);
  }
});

test("ordinary customer messages are left alone", () => {
  for (const text of [
    "Is the 5 marla house in DHA still available?",
    "What is the price?",
    "Can I visit on Saturday",
    "",
    "   ",
  ]) {
    assert.equal(classifyInboundIntent(text), "none", JSON.stringify(text));
  }
  assert.equal(classifyInboundIntent(null), "none");
  assert.equal(classifyInboundIntent(undefined), "none");
});

test("media and button replies need a human; reactions and stickers do not", () => {
  for (const type of ["image", "audio", "voice", "video", "document", "location", "button"]) {
    assert.ok(INBOUND_TYPES_NEEDING_HUMAN.has(type), type);
  }
  for (const type of ["text", "reaction", "sticker", "system"]) {
    assert.ok(!INBOUND_TYPES_NEEDING_HUMAN.has(type), type);
  }
});

test("permanent follow-up failures are distinguishable so they are never auto-retried", () => {
  const error = new PermanentFollowupError("Customer WhatsApp opt-in is missing or withdrawn.");
  assert.ok(error instanceof Error);
  assert.ok(error instanceof PermanentFollowupError);
  assert.equal(error.name, "PermanentFollowupError");
  assert.ok(!(new Error("network") instanceof PermanentFollowupError));
  // A transient failure is still retried; the permanent kind must bypass this.
  assert.notEqual(getSafeFollowupRetryAt(1, Date.UTC(2026, 0, 1)), null);
});
