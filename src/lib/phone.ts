/** Normalize common Pakistani local formats and international input to E.164. */
export function normalizePhoneE164(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let digits = trimmed.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);

  if (trimmed.startsWith("+")) {
    // Explicit international input is respected as supplied.
  } else if (trimmed.startsWith("00")) {
    digits = digits.slice(2);
  } else if (digits.startsWith("0")) {
    // Pakistani mobile/landline local notation, e.g. 03001234567.
    digits = `92${digits.slice(1)}`;
  } else if (digits.startsWith("92")) {
    // Already supplied with Pakistan's country code.
  } else if (digits.length === 10 && digits.startsWith("3")) {
    // Pakistani mobile number without the leading zero/country code.
    digits = `92${digits}`;
  } else {
    // A non-Pakistan international number must include + or 00 so we do not
    // silently interpret its national trunk prefix as a country code.
    return null;
  }

  if (digits.length < 8 || digits.length > 15 || digits.startsWith("0")) return null;
  return `+${digits}`;
}

export function buildWhatsAppDraftUrl(phone: string, message: string): string | null {
  const normalized = normalizePhoneE164(phone);
  if (!normalized) return null;
  return `https://wa.me/${normalized.slice(1)}?text=${encodeURIComponent(message)}`;
}
