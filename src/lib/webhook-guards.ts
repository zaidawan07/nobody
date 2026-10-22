/** Maximum accepted Meta webhook body. Real payloads are a few KB; this bounds unauthenticated buffering. */
export const MAX_WEBHOOK_BODY_BYTES = 1_000_000;

export type WebhookPreflight =
  { ok: true } | { ok: false; status: 400 | 401 | 413; reason: string };

/**
 * Cheap checks run BEFORE the request body is buffered, so an unauthenticated
 * caller cannot make the Worker read an arbitrarily large body.
 */
export function webhookPreflight(headers: Pick<Headers, "get">): WebhookPreflight {
  if (!headers.get("x-hub-signature-256")) {
    return { ok: false, status: 401, reason: "Missing signature" };
  }
  const declared = headers.get("content-length");
  if (declared !== null) {
    const length = Number(declared);
    if (!Number.isFinite(length) || length < 0) {
      return { ok: false, status: 400, reason: "Invalid content length" };
    }
    if (length > MAX_WEBHOOK_BODY_BYTES) {
      return { ok: false, status: 413, reason: "Payload too large" };
    }
  }
  return { ok: true };
}

/** Reads a chunked body without buffering beyond the configured byte limit. */
export async function readBoundedWebhookBody(
  body: ReadableStream<Uint8Array> | null,
): Promise<string | null> {
  if (!body) return "";

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > MAX_WEBHOOK_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/** Parses only JSON object payloads accepted by the Meta webhook handler. */
export function parseWebhookPayload(raw: string): Record<string, unknown> | null {
  try {
    const payload: unknown = JSON.parse(raw);
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null;
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}
