/**
 * Shared WhatsApp consent and handoff rules used by the Edge Function worker
 * and unit tests. Keep these checks deterministic and independent of provider APIs.
 */

export function isOptOutRequest(body: string): boolean {
  const normalized = body.trim().toLocaleUpperCase().replace(/[.!?,;]+$/g, "").trim();
  const exactCommands = new Set([
    "STOP", "STOP ALL", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "REMOVE",
    "OPT OUT", "OPT-OUT", "روکیں", "بند کریں",
  ]);
  const phrases = [
    "PLEASE STOP", "STOP MESSAGING", "DO NOT MESSAGE", "DON'T MESSAGE",
    "UNSUBSCRIBE ME", "REMOVE ME", "مزید پیغام نہ بھیجیں",
  ];
  return exactCommands.has(normalized) || phrases.some((phrase) => normalized.startsWith(phrase + " ") || normalized === phrase);
}

export function isHandoffRequest(body: string, configuredKeywords: string[] | null | undefined): boolean {
  const normalized = body.trim().toLocaleLowerCase();
  const defaults = ["human", "real person", "live agent", "talk to agent", "speak to someone", "representative", "call me", "انسان", "ایجنٹ", "نمائندہ"];
  const keywords = [...defaults, ...(configuredKeywords ?? [])]
    .map((keyword) => keyword.trim().toLocaleLowerCase())
    .filter((keyword) => keyword.length >= 2);
  return keywords.some((keyword) => normalized.includes(keyword));
}
