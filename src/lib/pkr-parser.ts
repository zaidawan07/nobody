/**
 * Parse Pakistani PKR amounts typed by real users:
 *
 *   "50000", "50,000", "Rs 80,000", "80,000/month",
 *   "50 thousand", "50 hazaar", "50 hazar", "5 lakh", "5 lac",
 *   "50 lakh", "1 crore", "1 karor", "2 crore 50 lakh", "2.5 crore",
 *   "5 lakh 5 hazar", "pkr 1.5 crore"
 *
 * Returns a canonical integer PKR amount, or null when the text doesn't
 * cleanly describe a money amount. Never throws.
 */

const MULTIPLIER_HINTS: Array<[RegExp, number]> = [
  [/^(thousand|hazar|hazaar|haz\u0101r|hazaar|k)$/i, 1_000],
  [/^(lakh|lac|lacs|lakhs)$/i, 100_000],
  [/^(crore|karor|crores)$/i, 10_000_000],
  [/^(arab|arabs)$/i, 100_000_000],
];

const NUM_THEN_WORD = /(-?\d[\d,]*(?:\.\d+)?)\s*([a-zA-Z]+)?/g;

export function parsePkrAmount(input: string): number | null {
  if (!input) return null;
  let s = input.trim().toLowerCase();
  s = s.replace(/(pkr|rs\.?|rupees?)/gi, " ");
  s = (s.split(/\//)[0] ?? "").trim(); // drop "/month" style suffixes
  s = s.replace(/,/g, "");
  if (!s) return null;

  const tokens = s.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;

  let total = 0;
  let matched = false;
  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i]!;
    const numMatch = /^(-?\d+(?:\.\d+)?)$/.exec(tok);
    if (numMatch) {
      let value = parseFloat(numMatch[1]!);
      const next = tokens[i + 1];
      let multFound = 0;
      if (next !== undefined) {
        for (const [re, mult] of MULTIPLIER_HINTS) {
          if (re.test(next)) {
            multFound = mult;
            break;
          }
        }
      }
      if (multFound > 0) {
        total += value * multFound;
        i += 2;
      } else {
        total += value;
        i += 1;
      }
      matched = true;
      continue;
    }
    // Allow connectors like 'and', '+', 'of'
    if (/^(and|\+|of)$/.test(tok)) {
      i += 1;
      continue;
    }
    // A word could immediately FOLLOW a number we already handled; if we reach
    // here with a bare multiplier it's suspicious unless total is 0.
    let multFound = 0;
    for (const [re, mult] of MULTIPLIER_HINTS) {
      if (re.test(tok)) {
        multFound = mult;
        break;
      }
    }
    if (multFound > 0 && tokens.length === 1) {
      return null; // bare "lakh" without a number
    }
    if (multFound > 0 && i > 0) {
      // e.g. "2 crore 50 lakh" is handled by number+multi pairs; a trailing
      // bare multiplier like "crore" would already be consumed. Anything else
      // is garbage.
      return null;
    }
    return null;
  }
  if (!matched || !Number.isFinite(total) || total < 0) return null;
  return Math.round(total);
}
