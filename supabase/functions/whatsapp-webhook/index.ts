import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const encoder = new TextEncoder();
const MAX_BODY_BYTES = 1_000_000;

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function verifySignature(rawBody: string, signature: string, appSecret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  const expected = "sha256=" + Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return constantTimeEqual(expected, signature);
}


function createSupabaseFetch(apiKey: string): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers).forEach((value, name) => headers.set(name, value));
    if (apiKey.startsWith("sb_secret_") && headers.get("Authorization") === "Bearer " + apiKey) {
      headers.delete("Authorization");
    }
    headers.set("apikey", apiKey);
    return fetch(input, { ...init, headers });
  };
}

function textResponse(body: string, status = 200) {
  return new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

Deno.serve(async (request) => {
  const verifyToken = Deno.env.get("META_WEBHOOK_VERIFY_TOKEN");
  if (!verifyToken) return textResponse("Webhook is not configured.", 503);

  if (request.method === "GET") {
    const url = new URL(request.url);
    const mode = url.searchParams.get("hub.mode");
    const suppliedToken = url.searchParams.get("hub.verify_token") ?? "";
    const challenge = url.searchParams.get("hub.challenge") ?? "";
    if (mode === "subscribe" && challenge && constantTimeEqual(suppliedToken, verifyToken)) {
      return textResponse(challenge);
    }
    return textResponse("Forbidden", 403);
  }

  if (request.method !== "POST") return textResponse("Method not allowed", 405);
  const appSecret = Deno.env.get("META_APP_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!appSecret || !supabaseUrl || !serviceRoleKey) return textResponse("Webhook is not configured.", 503);

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) return textResponse("Payload too large", 413);
  const rawBody = await request.text();
  if (encoder.encode(rawBody).byteLength > MAX_BODY_BYTES) return textResponse("Payload too large", 413);

  const signature = request.headers.get("x-hub-signature-256") ?? "";
  if (!signature || !(await verifySignature(rawBody, signature, appSecret))) {
    return textResponse("Invalid signature", 401);
  }

  let payload: {
    entry?: Array<{ changes?: Array<{ value?: { metadata?: { phone_number_id?: string } } }> }>;
  };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return textResponse("Invalid JSON", 400);
  }

  const phoneNumberIds = new Set<string>();
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const phoneNumberId = change.value?.metadata?.phone_number_id;
      if (typeof phoneNumberId === "string" && /^\d{5,30}$/.test(phoneNumberId)) phoneNumberIds.add(phoneNumberId);
    }
  }
  // A verified Meta notification with no phone-number metadata is acknowledged,
  // but never interpreted as a message or allowed to select a tenant.
  if (phoneNumberIds.size === 0) return textResponse("EVENT_RECEIVED");

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    global: { fetch: createSupabaseFetch(serviceRoleKey) },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const bodyHash = await sha256Hex(rawBody);
  for (const phoneNumberId of phoneNumberIds) {
    const { data: config, error: configError } = await admin
      .from("whatsapp_configs")
      .select("agency_id")
      .eq("phone_number_id", phoneNumberId)
      .maybeSingle();
    if (configError) {
      console.error("Could not resolve WhatsApp tenant for a verified webhook.");
      return textResponse("Temporary tenant lookup failure", 500);
    }
    if (!config?.agency_id) {
      // Return non-2xx so Meta retries briefly if a connection was just completed
      // and the config write has not become visible yet.
      console.warn("Verified WhatsApp webhook received for an unregistered phone number ID.");
      return textResponse("Phone number is not registered on this platform", 503);
    }

    const { error: insertError } = await admin.from("whatsapp_webhook_events").upsert({
      event_key: bodyHash + ":" + phoneNumberId,
      agency_id: config.agency_id,
      phone_number_id: phoneNumberId,
      payload,
      status: "received",
    }, { onConflict: "event_key", ignoreDuplicates: true });
    if (insertError) {
      console.error("Could not persist a verified WhatsApp webhook event.");
      return textResponse("Temporary event persistence failure", 500);
    }
  }

  return textResponse("EVENT_RECEIVED");
});
