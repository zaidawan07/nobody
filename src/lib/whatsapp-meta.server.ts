import { decryptWhatsappToken } from "./whatsapp-crypto.server";

export const META_ACCOUNT_UPDATE_ELIGIBLE_STATES = ["connected", "attention_required"] as const;

export function getMetaAccountUpdateState(event: string): "disconnected" | "attention_required" {
  return event === "ACCOUNT_OFFBOARDED" || event === "PARTNER_REMOVED"
    ? "disconnected"
    : "attention_required";
}

function graphVersion() {
  const version = process.env["META_GRAPH_API_VERSION"];
  if (!version || !/^v\d+\.\d+$/.test(version)) {
    throw new Error("Set META_GRAPH_API_VERSION to the version enabled for your Meta app.");
  }
  return version;
}

export async function verifyMetaSignature(
  rawBody: string,
  signature: string | null,
): Promise<boolean> {
  const secret = process.env["META_APP_SECRET"];
  if (!secret || !signature?.startsWith("sha256=")) return false;
  const suppliedHex = signature.slice(7);
  if (!/^[a-f0-9]{64}$/i.test(suppliedHex)) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const supplied = Uint8Array.from(suppliedHex.match(/.{2}/g) ?? [], (pair) =>
    Number.parseInt(pair, 16),
  );
  return crypto.subtle.verify("HMAC", key, supplied, new TextEncoder().encode(rawBody));
}

export async function graphRequest<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const url = new URL(`https://graph.facebook.com/${graphVersion()}/${path.replace(/^\//, "")}`);
  const response = await fetch(url, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(15_000),
    headers: {
      authorization: `Bearer ${token}`,
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const payload = (await response.json().catch(() => null)) as
    (T & { error?: { message?: string; code?: number } }) | null;
  if (!response.ok || !payload) {
    throw new Error(`Meta Graph API request failed (status ${response.status}).`);
  }
  return payload;
}

export async function sendMetaTextMessage(input: {
  phoneNumberId: string;
  tokenRow: { ciphertext: string; iv: string; auth_tag: string };
  recipient: string;
  text: string;
}) {
  const token = await decryptWhatsappToken(input.tokenRow);
  return graphRequest<{ messages?: Array<{ id: string }> }>(
    `${encodeURIComponent(input.phoneNumberId)}/messages`,
    token,
    {
      method: "POST",
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: input.recipient,
        type: "text",
        text: { preview_url: false, body: input.text.slice(0, 4096) },
      }),
    },
  );
}

export async function sendMetaTemplateMessage(input: {
  phoneNumberId: string;
  tokenRow: { ciphertext: string; iv: string; auth_tag: string };
  recipient: string;
  templateName: string;
  language: string;
}) {
  const token = await decryptWhatsappToken(input.tokenRow);
  return graphRequest<{ messages?: Array<{ id: string }> }>(
    `${encodeURIComponent(input.phoneNumberId)}/messages`,
    token,
    {
      method: "POST",
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: input.recipient,
        type: "template",
        template: { name: input.templateName, language: { code: input.language } },
      }),
    },
  );
}
