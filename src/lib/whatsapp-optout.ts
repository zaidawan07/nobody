/**
 * Classifies inbound WhatsApp text so opt-outs are honoured and ambiguous
 * "stop" requests reach a human instead of receiving an automated reply.
 *
 *  - "opt_out": the whole message is a clear request to stop (STOP, unsubscribe...).
 *  - "review":  the message mentions stopping/unsubscribing/spam inside a longer
 *               sentence. It is NOT treated as an opt-out (so "stop by tomorrow to
 *               see the house" does not silence a lead) but AI replies are paused
 *               and a human is asked to look.
 *  - "none":    everything else.
 */
export type InboundIntent = "opt_out" | "review" | "none";

const OPT_OUT_PHRASES = new Set([
  "stop",
  "stop all",
  "stop messages",
  "stop messaging",
  "stop messaging me",
  "stop sending",
  "stop sending messages",
  "stop sending me messages",
  "stop texting",
  "stop texting me",
  "please stop",
  "stop it",
  "unsubscribe",
  "cancel",
  "end",
  "quit",
  "opt out",
  "optout",
  "opt-out",
  "remove me",
  "dont message",
  "dont message me",
  "don't message",
  "don't message me",
  "do not message",
  "do not message me",
  // Roman Urdu. A native speaker should review this short list before launch.
  "band karo",
  "band kar do",
  "mat bhejo",
  "message mat bhejo",
  "message mat karo",
  "msg mat karo",
]);

const REVIEW_PATTERN = /\b(?:stop|unsubscribe|spam|harass(?:ing|ment)?)\b/;

function normalize(text: string): string {
  return text
    .toLocaleLowerCase()
    .replace(/[‘’´`]/g, "'")
    .replace(/[.!?,;:"]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function classifyInboundIntent(text: string | null | undefined): InboundIntent {
  const normalized = normalize(String(text ?? ""));
  if (!normalized) return "none";
  if (OPT_OUT_PHRASES.has(normalized)) return "opt_out";
  if (REVIEW_PATTERN.test(normalized)) return "review";
  return "none";
}

/** Non-text inbound types that an automated assistant cannot read and a human should see. */
export const INBOUND_TYPES_NEEDING_HUMAN = new Set([
  "image",
  "audio",
  "voice",
  "video",
  "document",
  "location",
  "contacts",
  "interactive",
  "button",
  "unsupported",
]);
