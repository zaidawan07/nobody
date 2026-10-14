import { createServerFn } from "@tanstack/react-start";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AgencyAdminContext = { agencyId: string; userId: string };

async function requireAgencyAdmin(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<AgencyAdminContext> {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("agency_id")
    .eq("id", userId)
    .maybeSingle();
  if (profileError || !profile?.agency_id) throw new Error("Your account is not linked to an agency.");
  const { data: roles, error: rolesError } = await supabase
    .from("user_roles")
    .select("role, agency_id")
    .eq("user_id", userId)
    .eq("agency_id", profile.agency_id);
  if (rolesError || !(roles ?? []).some((row: { role: string }) => row.role === "agency_admin")) {
    throw new Error("Only an agency administrator can connect WhatsApp.");
  }
  return { agencyId: profile.agency_id, userId };
}

async function requireAgencyMember(supabase: SupabaseClient<Database>, userId: string): Promise<AgencyAdminContext> {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("agency_id")
    .eq("id", userId)
    .maybeSingle();
  if (profileError || !profile?.agency_id) throw new Error("Your account is not linked to an agency.");
  const { data: roles, error: rolesError } = await supabase
    .from("user_roles")
    .select("role, agency_id")
    .eq("user_id", userId)
    .eq("agency_id", profile.agency_id);
  if (rolesError || !(roles ?? []).some((row) => row.role === "agency_admin" || row.role === "employee")) {
    throw new Error("Your account does not have an agency messaging role.");
  }
  return { agencyId: profile.agency_id, userId };
}

function adminClient() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) throw new Error("Supabase server credentials are not configured.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function requiredMetaConfig() {
  const appId = process.env["META_APP_ID"];
  const appSecret = process.env["META_APP_SECRET"];
  const configId = process.env["META_EMBEDDED_SIGNUP_CONFIG_ID"];
  const graphApiVersion = process.env["META_GRAPH_API_VERSION"] || "v25.0";
  const encryptionKey = process.env["META_TOKEN_ENCRYPTION_KEY"];
  if (!appId || !appSecret || !configId || !encryptionKey) {
    throw new Error("Meta Embedded Signup is not fully configured on the server.");
  }
  if (!/^v\d+\.\d+$/.test(graphApiVersion)) throw new Error("META_GRAPH_API_VERSION is invalid.");
  return { appId, appSecret, configId, graphApiVersion, encryptionKey };
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function decodeBase64(value: string) {
  try {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new Error("META_TOKEN_ENCRYPTION_KEY must be base64 encoded.");
  }
}

function encodeBase64(value: Uint8Array) {
  return btoa(Array.from(value, (byte) => String.fromCharCode(byte)).join(""));
}

async function encryptAccessToken(token: string, keyBase64: string) {
  const rawKey = decodeBase64(keyBase64);
  if (rawKey.length !== 32) throw new Error("META_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  const key = await crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(token));
  return "v1:" + encodeBase64(iv) + ":" + encodeBase64(new Uint8Array(encrypted));
}

async function decryptAccessToken(encryptedValue: string, keyBase64: string) {
  const parts = encryptedValue.split(":");
  if (parts.length !== 3 || parts[0] !== "v1") throw new Error("Unsupported encrypted WhatsApp token format.");
  const rawKey = decodeBase64(keyBase64);
  if (rawKey.length !== 32) throw new Error("META_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  const key = await crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decodeBase64(parts[1] ?? "") }, key, decodeBase64(parts[2] ?? ""));
  return new TextDecoder().decode(plaintext);
}

async function hmacHex(secret: string, value: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function metaJson(url: URL, token?: string, method = "GET", body?: Record<string, unknown>) {
  const response = await fetch(url, {
    method,
    headers: { ...(token ? { Authorization: "Bearer " + token } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error("Meta API request failed (HTTP " + response.status + ").");
  return payload;
}

export const createWhatsAppConnectionSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { agencyId, userId } = await requireAgencyAdmin(context.supabase, context.userId);
    const config = requiredMetaConfig();
    const state = crypto.randomUUID();
    const stateHash = await sha256Hex(state);
    const admin = adminClient();
    const { error } = await admin.from("whatsapp_connection_sessions").insert({
      agency_id: agencyId,
      user_id: userId,
      config_id: config.configId,
      state_hash: stateHash,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    if (error) throw new Error("Could not create a secure WhatsApp connection session.");
    return { state, appId: config.appId, configId: config.configId, graphApiVersion: config.graphApiVersion };
  });

export const completeWhatsAppEmbeddedSignup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    state: z.string().uuid(),
    code: z.string().min(1).max(4096),
    wabaId: z.string().regex(/^\d{5,30}$/),
    phoneNumberId: z.string().regex(/^\d{5,30}$/),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { agencyId, userId } = await requireAgencyAdmin(context.supabase, context.userId);
    const config = requiredMetaConfig();
    const admin = adminClient();
    const stateHash = await sha256Hex(data.state);
    const { data: session, error: sessionError } = await admin
      .from("whatsapp_connection_sessions")
      .select("id, agency_id, user_id, config_id, expires_at, consumed_at")
      .eq("state_hash", stateHash)
      .eq("agency_id", agencyId)
      .eq("user_id", userId)
      .maybeSingle();
    if (sessionError || !session || session.consumed_at || new Date(session.expires_at).getTime() <= Date.now()) {
      throw new Error("WhatsApp connection session is invalid or expired. Start again.");
    }
    if (session.config_id !== config.configId) throw new Error("The Meta signup configuration changed. Start again.");

    // Consume the nonce before exchanging the one-use Meta code to prevent replay.
    const { data: consumed, error: consumeError } = await admin
      .from("whatsapp_connection_sessions")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", session.id)
      .is("consumed_at", null)
      .gt("expires_at", new Date().toISOString())
      .select("id")
      .maybeSingle();
    if (consumeError || !consumed) throw new Error("WhatsApp connection session has already been used.");

    const tokenUrl = new URL("https://graph.facebook.com/" + config.graphApiVersion + "/oauth/access_token");
    tokenUrl.searchParams.set("client_id", config.appId);
    tokenUrl.searchParams.set("client_secret", config.appSecret);
    tokenUrl.searchParams.set("code", data.code);
    const tokenResult = await metaJson(tokenUrl);
    const accessToken = typeof tokenResult["access_token"] === "string" ? tokenResult["access_token"] : "";
    if (!accessToken) throw new Error("Meta did not return an access token.");

    // Verify the token belongs to this app and has the WhatsApp permissions needed.
    const debugUrl = new URL("https://graph.facebook.com/" + config.graphApiVersion + "/debug_token");
    debugUrl.searchParams.set("input_token", accessToken);
    debugUrl.searchParams.set("access_token", config.appId + "|" + config.appSecret);
    const debugResult = await metaJson(debugUrl);
    const tokenData = debugResult["data"] as { is_valid?: boolean; app_id?: string; scopes?: string[] } | undefined;
    if (!tokenData?.is_valid || tokenData.app_id !== config.appId) throw new Error("Meta returned a token that is not valid for this app.");
    const scopes = tokenData.scopes ?? [];
    if (!scopes.includes("whatsapp_business_management") || !scopes.includes("whatsapp_business_messaging")) {
      throw new Error("The connected Meta account did not grant the required WhatsApp permissions.");
    }

    const proof = await hmacHex(config.appSecret, accessToken);
    const numbersUrl = new URL("https://graph.facebook.com/" + config.graphApiVersion + "/" + data.wabaId + "/phone_numbers");
    numbersUrl.searchParams.set("fields", "id,display_phone_number,verified_name,status");
    numbersUrl.searchParams.set("appsecret_proof", proof);
    const numberResult = await metaJson(numbersUrl, accessToken);
    const numbers = Array.isArray(numberResult["data"]) ? numberResult["data"] as Array<{ id?: string; display_phone_number?: string; verified_name?: string; status?: string }> : [];
    const phone = numbers.find((item) => item.id === data.phoneNumberId);
    if (!phone) throw new Error("The selected phone number could not be verified under the authorized WhatsApp Business Account.");

    const encryptedToken = await encryptAccessToken(accessToken, config.encryptionKey);
    const now = new Date();
    const expiresAt = typeof tokenResult["expires_in"] === "number"
      ? new Date(now.getTime() + tokenResult["expires_in"] * 1000).toISOString()
      : null;
    const alreadyRegistered = phone.status === "CONNECTED";
    const { error: saveError } = await admin.from("whatsapp_configs").upsert({
      agency_id: agencyId,
      waba_id: data.wabaId,
      phone_number_id: data.phoneNumberId,
      access_token_encrypted: encryptedToken,
      token_key_version: 1,
      access_token_expires_at: expiresAt,
      whatsapp_number: phone.display_phone_number ?? null,
      display_name: phone.verified_name ?? null,
      connection_status: alreadyRegistered ? "connected" : "pending",
      connection_error: alreadyRegistered ? null : "Phone registration is required. Enter the six-digit WhatsApp registration PIN.",
      connected_at: alreadyRegistered ? now.toISOString() : null,
      connected_by: userId,
      webhook_subscribed_at: null,
      last_connected_at: now.toISOString(),
      registration_attempts: 0,
      ai_enabled: false,
    }, { onConflict: "agency_id" });
    if (saveError?.code === "23505") throw new Error("This WhatsApp number is already connected to another agency.");
    if (saveError) throw new Error("Meta assets were verified but the agency configuration could not be saved. Contact support before retrying.");

    const subscribeUrl = new URL("https://graph.facebook.com/" + config.graphApiVersion + "/" + data.wabaId + "/subscribed_apps");
    subscribeUrl.searchParams.set("appsecret_proof", proof);
    try {
      await metaJson(subscribeUrl, accessToken, "POST");
    } catch {
      await admin.from("whatsapp_configs").update({
        connection_status: "error",
        connection_error: "Meta webhook subscription failed. Reconnect after checking the Meta app's WhatsApp webhook setup.",
      }).eq("agency_id", agencyId);
      throw new Error("Meta could not subscribe this business account to webhooks. Check the Meta app webhook setup and reconnect.");
    }
    await admin.from("whatsapp_configs").update({ webhook_subscribed_at: new Date().toISOString() }).eq("agency_id", agencyId);
    return {
      connected: alreadyRegistered,
      needsPin: !alreadyRegistered,
      phoneNumber: phone.display_phone_number ?? null,
      displayName: phone.verified_name ?? null,
    };
  });


export const registerWhatsAppPhoneNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ pin: z.string().regex(/^\\d{6}$/) }).parse(input))
  .handler(async ({ data, context }) => {
    const { agencyId } = await requireAgencyAdmin(context.supabase, context.userId);
    const config = requiredMetaConfig();
    const admin = adminClient();
    const { data: connection, error: loadError } = await admin
      .from("whatsapp_configs")
      .select("phone_number_id, access_token_encrypted, connection_status, registration_attempts")
      .eq("agency_id", agencyId)
      .maybeSingle();
    if (loadError || !connection?.phone_number_id || !connection.access_token_encrypted) {
      throw new Error("Connect the WhatsApp business account through Meta before registering its phone number.");
    }
    if (connection.connection_status === "connected") return { connected: true };
    const attempts = connection.registration_attempts ?? 0;
    if (attempts >= 5) throw new Error("Too many PIN attempts. Reconnect through Meta or contact the platform operator.");
    const { error: attemptError } = await admin.from("whatsapp_configs")
      .update({ registration_attempts: attempts + 1 })
      .eq("agency_id", agencyId);
    if (attemptError) throw new Error("Could not record the registration attempt.");
    const token = await decryptAccessToken(connection.access_token_encrypted, config.encryptionKey);
    const proof = await hmacHex(config.appSecret, token);
    const registerUrl = new URL("https://graph.facebook.com/" + config.graphApiVersion + "/" + connection.phone_number_id + "/register");
    registerUrl.searchParams.set("appsecret_proof", proof);
    try {
      const result = await metaJson(registerUrl, token, "POST", { messaging_product: "whatsapp", pin: data.pin });
      if (result["success"] !== true && result["success"] !== "true") throw new Error("Meta did not confirm phone registration.");
    } catch {
      await admin.from("whatsapp_configs").update({
        connection_error: "Phone registration failed. Verify the six-digit PIN and try again.",
      }).eq("agency_id", agencyId);
      throw new Error("Phone registration failed. Verify the six-digit PIN and try again.");
    }
    const now = new Date().toISOString();
    const { error: updateError } = await admin.from("whatsapp_configs").update({
      connection_status: "connected",
      connection_error: null,
      connected_at: now,
      last_connected_at: now,
      registration_attempts: 0,
      ai_enabled: false,
    }).eq("agency_id", agencyId);
    if (updateError) throw new Error("Meta registered the phone, but the local connection state could not be saved. Contact support.");
    return { connected: true };
  });


export const sendWhatsAppMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    conversationId: z.string().uuid(),
    clientRequestId: z.string().uuid(),
    body: z.string().trim().min(1).max(4096),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { agencyId, userId } = await requireAgencyMember(context.supabase, context.userId);
    const admin = adminClient();

    // Idempotency is checked before the 24-hour window so a retry never sends
    // a second message or fails merely because the window elapsed afterward.
    const { data: existing, error: existingError } = await admin
      .from("conversation_messages")
      .select("id,conversation_id,body,provider_status,provider_message_id")
      .eq("agency_id", agencyId)
      .eq("client_request_id", data.clientRequestId)
      .maybeSingle();
    if (existingError) throw new Error("Could not verify the message request.");
    if (existing) {
      if (existing.conversation_id !== data.conversationId || existing.body !== data.body) {
        throw new Error("This request ID was already used for a different message.");
      }
      return { messageId: existing.id, providerMessageId: existing.provider_message_id ?? null, status: existing.provider_status ?? "pending", duplicate: true };
    }

    const { data: conversation, error: conversationError } = await admin
      .from("conversations")
      .select("id,agency_id,customer_phone,state,handoff_requested,last_customer_message_at,opted_out_at")
      .eq("id", data.conversationId)
      .eq("agency_id", agencyId)
      .maybeSingle();
    if (conversationError || !conversation) throw new Error("Conversation was not found in your agency.");
    if (conversation.opted_out_at) throw new Error("This customer has opted out. Outbound messages are blocked.");
    if (conversation.state !== "human_active" && !conversation.handoff_requested) {
      throw new Error("Take over this conversation before sending a human reply.");
    }
    const lastInbound = conversation.last_customer_message_at ? new Date(conversation.last_customer_message_at).getTime() : Number.NaN;
    const elapsed = Date.now() - lastInbound;
    if (!Number.isFinite(lastInbound) || elapsed < 0 || elapsed > 24 * 60 * 60 * 1000) {
      throw new Error("The 24-hour customer service window is closed. Approved template sending is not enabled, so this free-form message was not sent.");
    }

    const config = requiredMetaConfig();
    const { data: connection, error: connectionError } = await admin
      .from("whatsapp_configs")
      .select("phone_number_id,access_token_encrypted,access_token_expires_at,connection_status")
      .eq("agency_id", agencyId)
      .maybeSingle();
    if (connectionError || !connection?.phone_number_id || !connection.access_token_encrypted || connection.connection_status !== "connected") {
      throw new Error("The agency's official WhatsApp channel is not connected.");
    }
    if (connection.access_token_expires_at && new Date(connection.access_token_expires_at).getTime() <= Date.now()) {
      throw new Error("The WhatsApp access token has expired. Reconnect the channel before sending.");
    }

    const { data: message, error: insertError } = await admin.from("conversation_messages").insert({
      agency_id: agencyId,
      conversation_id: conversation.id,
      sender: "employee",
      body: data.body,
      provider_status: "pending",
      client_request_id: data.clientRequestId,
      created_by: userId,
      created_at: new Date().toISOString(),
    }).select("id").single();
    if (insertError || !message) {
      if (insertError?.code === "23505") {
        const { data: raced } = await admin.from("conversation_messages")
          .select("id,conversation_id,body,provider_status,provider_message_id")
          .eq("agency_id", agencyId)
          .eq("client_request_id", data.clientRequestId)
          .maybeSingle();
        if (raced && raced.conversation_id === data.conversationId && raced.body === data.body) {
          return { messageId: raced.id, providerMessageId: raced.provider_message_id ?? null, status: raced.provider_status ?? "pending", duplicate: true };
        }
      }
      throw new Error("Could not reserve the message for safe delivery.");
    }

    try {
      const token = await decryptAccessToken(connection.access_token_encrypted, config.encryptionKey);
      const proof = await hmacHex(config.appSecret, token);
      const sendUrl = new URL("https://graph.facebook.com/" + config.graphApiVersion + "/" + connection.phone_number_id + "/messages");
      sendUrl.searchParams.set("appsecret_proof", proof);
      const result = await metaJson(sendUrl, token, "POST", {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: conversation.customer_phone,
        type: "text",
        text: { preview_url: false, body: data.body },
        biz_opaque_callback_data: data.clientRequestId,
      });
      const messages = Array.isArray(result["messages"]) ? result["messages"] as Array<{ id?: string }> : [];
      const providerMessageId = typeof messages[0]?.id === "string" ? messages[0].id : "";
      if (!providerMessageId) throw new Error("Meta did not return a message ID.");
      const sentAt = new Date().toISOString();
      const { error: savedError } = await admin.from("conversation_messages").update({
        provider_message_id: providerMessageId,
        provider_status: "sent",
        sent_at: sentAt,
      }).eq("id", message.id).eq("agency_id", agencyId);
      if (savedError) throw new Error("Meta accepted the message, but its delivery record could not be saved. Do not resend blindly.");
      await admin.from("conversations").update({ last_message_at: sentAt }).eq("id", conversation.id).eq("agency_id", agencyId);
      return { messageId: message.id, providerMessageId, status: "sent", duplicate: false };
    } catch (error) {
      const safeMessage = error instanceof Error && error.message.includes("Do not resend blindly")
        ? error.message
        : "WhatsApp could not confirm delivery. Check the channel and message status before retrying.";
      await admin.from("conversation_messages").update({
        provider_status: "failed",
        failed_at: new Date().toISOString(),
        error_message: safeMessage.slice(0, 500),
      }).eq("id", message.id).eq("agency_id", agencyId);
      throw new Error(safeMessage);
    }
  });
