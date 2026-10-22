/* eslint-disable @typescript-eslint/no-explicit-any -- WhatsApp tables are introduced by pending local migrations and are not yet present in the generated Supabase Database type. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const completeInput = z.object({
  code: z.string().min(10).max(4096),
  ticket: z.string().min(20).max(200),
  wabaId: z.string().regex(/^\d{5,30}$/),
  phoneNumberId: z
    .string()
    .regex(/^\d{5,30}$/)
    .optional(),
  coexistence: z.boolean().default(false),
});
const conversationInput = z.object({ conversationId: z.string().uuid() });
const sendInput = conversationInput.extend({
  body: z.string().trim().min(1).max(4000),
  requestId: z.string().uuid(),
});

async function getWhatsappMembership(supabase: any, userId: string) {
  const [{ data: profile, error: profileError }, { data, error }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id,agency_id")
      .eq("id", userId)
      .eq("status", "active")
      .maybeSingle(),
    supabase
      .from("user_roles")
      .select("agency_id,role")
      .eq("user_id", userId)
      .in("role", ["agency_admin", "employee"])
      .maybeSingle(),
  ]);
  if (
    profileError ||
    !profile ||
    error ||
    !data?.agency_id ||
    profile.agency_id !== data.agency_id ||
    !["agency_admin", "employee"].includes(data.role)
  ) {
    throw new Error("WhatsApp access is not available for this account.");
  }
  return { agencyId: data.agency_id as string, role: data.role as "agency_admin" | "employee" };
}

async function getAccessibleWhatsappConversation(
  supabase: any,
  userId: string,
  conversationId: string,
) {
  const membership = await getWhatsappMembership(supabase, userId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let query = (supabaseAdmin as any)
    .from("whatsapp_conversations")
    .select(
      "id,agency_id,connection_id,contact_id,assigned_to,window_expires_at,whatsapp_contacts(id,phone,opt_in_status),whatsapp_connections(phone_number_id,state)",
    )
    .eq("id", conversationId)
    .eq("agency_id", membership.agencyId);
  if (membership.role === "employee") query = query.eq("assigned_to", userId);
  const { data, error } = await query.maybeSingle();
  if (error || !data) throw new Error("Conversation not found or access denied.");
  return { ...membership, conversation: data, supabaseAdmin };
}

async function requireAgencyAdmin(supabase: any, userId: string) {
  const [{ data: profile, error: profileError }, { data, error }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id,agency_id")
      .eq("id", userId)
      .eq("status", "active")
      .maybeSingle(),
    supabase
      .from("user_roles")
      .select("agency_id")
      .eq("user_id", userId)
      .eq("role", "agency_admin")
      .maybeSingle(),
  ]);
  if (profileError || !profile || error || !data?.agency_id || profile.agency_id !== data.agency_id)
    throw new Error("Only an agency administrator can connect WhatsApp.");
  return data.agency_id as string;
}

export const beginWhatsappSignup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const agencyId = await requireAgencyAdmin(context.supabase, context.userId);
    const appId = process.env["META_APP_ID"];
    const configId = process.env["META_EMBEDDED_SIGNUP_CONFIG_ID"];
    const graphVersion = process.env["META_GRAPH_API_VERSION"];
    if (!appId || !configId || !graphVersion || !/^v\d+\.\d+$/.test(graphVersion)) {
      return { ready: false as const, reason: "Meta app setup is not configured yet." };
    }
    const ticket = crypto.randomUUID() + crypto.randomUUID();
    const { hashWhatsappSignupState } = await import("@/lib/whatsapp-crypto.server");
    const stateHash = await hashWhatsappSignupState(ticket);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).from("whatsapp_signup_sessions").insert({
      agency_id: agencyId,
      user_id: context.userId,
      state_hash: stateHash,
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    });
    if (error) throw new Error("Could not start Meta signup. Please try again.");
    return { ready: true as const, appId, configId, graphVersion, ticket };
  });

export const completeWhatsappSignup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => completeInput.parse(input))
  .handler(async ({ context, data }) => {
    const agencyId = await requireAgencyAdmin(context.supabase, context.userId);
    if (!data.coexistence) {
      throw new Error(
        "EstateOS connects existing WhatsApp Business app numbers. Choose that number and complete Meta's Coexistence confirmation.",
      );
    }
    const appId = process.env["META_APP_ID"];
    const appSecret = process.env["META_APP_SECRET"];
    const graphVersion = process.env["META_GRAPH_API_VERSION"];
    if (!appId || !appSecret || !graphVersion || !/^v\d+\.\d+$/.test(graphVersion)) {
      throw new Error("Meta app credentials are not fully configured.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { encryptWhatsappToken, hashWhatsappSignupState } =
      await import("@/lib/whatsapp-crypto.server");
    const { graphRequest } = await import("@/lib/whatsapp-meta.server");
    const { data: session, error: sessionError } = await (supabaseAdmin as any)
      .from("whatsapp_signup_sessions")
      .update({ consumed_at: new Date().toISOString() })
      .eq("state_hash", await hashWhatsappSignupState(data.ticket))
      .eq("agency_id", agencyId)
      .eq("user_id", context.userId)
      .is("consumed_at", null)
      .gt("expires_at", new Date().toISOString())
      .select("id")
      .maybeSingle();
    if (sessionError || !session) throw new Error("Signup expired or already used. Start again.");

    const exchangeUrl = new URL(`https://graph.facebook.com/${graphVersion}/oauth/access_token`);
    exchangeUrl.searchParams.set("client_id", appId);
    exchangeUrl.searchParams.set("client_secret", appSecret);
    exchangeUrl.searchParams.set("code", data.code);
    const exchangeResponse = await fetch(exchangeUrl);
    const exchanged = (await exchangeResponse.json().catch(() => null)) as {
      access_token?: string;
      expires_in?: number;
      error?: { message?: string };
    } | null;
    if (!exchangeResponse.ok || !exchanged?.access_token) {
      throw new Error("Meta authorization could not be completed. Please try again.");
    }
    const token = exchanged.access_token;

    // Coexistence completion events may omit phone_number_id. Discover the
    // connected Business App number from the authorized WABA, then verify its
    // registration state directly with Meta before saving it as connected.
    type Phone = {
      id: string;
      display_phone_number?: string;
      verified_name?: string;
      quality_rating?: string;
      is_on_biz_app?: boolean;
      platform_type?: string;
    };
    const { data: phones } = await graphRequest<{ data?: Phone[] }>(
      `${encodeURIComponent(data.wabaId)}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,is_on_biz_app,platform_type`,
      token,
    );
    if (!phones?.length) {
      throw new Error("Meta did not return any phone numbers for the authorized business account.");
    }

    let selectedPhone = data.phoneNumberId
      ? phones.find((item) => item.id === data.phoneNumberId)
      : undefined;
    if (data.phoneNumberId && !selectedPhone) {
      throw new Error("That WhatsApp number is not attached to the authorized business account.");
    }
    if (!selectedPhone && data.coexistence) {
      let candidates = phones.filter(
        (item) => item.is_on_biz_app === true && item.platform_type === "CLOUD_API",
      );
      // Some Graph API versions omit the status fields on the WABA edge. In
      // that case, query the documented phone-number status endpoint per ID.
      if (candidates.length === 0 && phones.every((item) => item.is_on_biz_app == null)) {
        const statuses = await Promise.all(
          phones.map((item) =>
            graphRequest<Phone>(
              `${encodeURIComponent(item.id)}?fields=id,display_phone_number,verified_name,quality_rating,is_on_biz_app,platform_type`,
              token,
            ),
          ),
        );
        candidates = statuses.filter(
          (item) => item.is_on_biz_app === true && item.platform_type === "CLOUD_API",
        );
        if (candidates.length === 1) selectedPhone = candidates[0];
      } else if (candidates.length === 1) {
        selectedPhone = candidates[0];
      }
      if (!selectedPhone) {
        throw new Error(
          candidates.length > 1
            ? "Meta found multiple WhatsApp Business App numbers on this account. Connect one number per WABA and try again."
            : "Meta did not confirm an existing WhatsApp Business App number connected to Cloud API. Finish the Coexistence steps in Meta, then try again.",
        );
      }
    }
    if (!selectedPhone) {
      throw new Error(
        "This signup did not complete the existing WhatsApp Business App Coexistence flow. Choose the existing app number in Meta and finish its confirmation steps.",
      );
    }
    const phone = await graphRequest<Phone>(
      `${encodeURIComponent(selectedPhone.id)}?fields=id,display_phone_number,verified_name,quality_rating,is_on_biz_app,platform_type`,
      token,
    );
    if (phone.id !== selectedPhone.id)
      throw new Error("Meta returned a different phone number than the signup flow.");
    if (data.coexistence && (phone.is_on_biz_app !== true || phone.platform_type !== "CLOUD_API")) {
      throw new Error(
        "Meta has not confirmed this number is active on both WhatsApp Business App and Cloud API yet. Complete the in-app confirmation and retry.",
      );
    }
    await graphRequest(`${encodeURIComponent(data.wabaId)}/subscribed_apps`, token, {
      method: "POST",
    });

    const { data: existing } = await (supabaseAdmin as any)
      .from("whatsapp_connections")
      .select("id")
      .eq("agency_id", agencyId)
      .eq("state", "connected")
      .maybeSingle();
    if (existing)
      throw new Error("This agency already has a connected WhatsApp number. Disconnect it first.");

    const { data: connection, error: insertError } = await (supabaseAdmin as any)
      .from("whatsapp_connections")
      .insert({
        agency_id: agencyId,
        provider: "meta",
        state: "not_connected",
        waba_id: data.wabaId,
        phone_number_id: phone.id,
        display_number: phone.display_phone_number ?? null,
        display_name: phone.verified_name ?? null,
        is_coexistence: data.coexistence,
        quality_rating: phone.quality_rating ?? null,
      })
      .select("id")
      .single();
    if (insertError || !connection) throw new Error("Could not save the WhatsApp connection.");

    const encrypted = await encryptWhatsappToken(token);
    const { error: credentialError } = await (supabaseAdmin as any)
      .from("whatsapp_credentials")
      .insert({
        agency_id: agencyId,
        connection_id: connection.id,
        key_version: 1,
        ...encrypted,
        token_hint: `${token.slice(0, 4)}…${token.slice(-4)}`,
        token_expires_at: exchanged.expires_in
          ? new Date(Date.now() + exchanged.expires_in * 1000).toISOString()
          : null,
      });
    if (credentialError)
      throw new Error(
        "Connection created but credential storage failed; contact support before retrying.",
      );

    for (const state of ["authorization_pending", "connecting", "connected"] as const) {
      const { error } = await (supabaseAdmin as any)
        .from("whatsapp_connections")
        .update({
          state,
          state_reason: "Meta Embedded Signup completed and webhook subscription verified.",
        })
        .eq("id", connection.id);
      if (error) {
        await (supabaseAdmin as any)
          .from("whatsapp_connections")
          .update({
            state: "attention_required",
            state_reason: "Provider setup requires operator review.",
          })
          .eq("id", connection.id);
        throw new Error("Meta authorized the number, but final connection setup needs support.");
      }
    }
    return {
      connected: true as const,
      displayNumber: phone.display_phone_number ?? "WhatsApp number",
    };
  });

export const listWhatsappInbox = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const membership = await getWhatsappMembership(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = (supabaseAdmin as any)
      .from("whatsapp_conversations")
      .select(
        "id, contact_id, lead_id, assigned_to, last_message_at, unread_count, window_expires_at, ai_paused_at, handoff_reason, whatsapp_contacts(name, phone, opt_in_status, opt_in_source, opt_in_at)",
      )
      .eq("agency_id", membership.agencyId)
      .order("last_message_at", { ascending: false })
      .limit(50);
    if (membership.role === "employee") query = query.eq("assigned_to", context.userId);
    const { data, error } = await query;
    if (error) throw new Error("Unable to load WhatsApp inbox.");
    return { conversations: data ?? [] };
  });

export const listWhatsappMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => conversationInput.parse(input))
  .handler(async ({ context, data }) => {
    const { agencyId, role } = await getWhatsappMembership(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let conversationQuery = (supabaseAdmin as any)
      .from("whatsapp_conversations")
      .select("id,assigned_to")
      .eq("id", data.conversationId)
      .eq("agency_id", agencyId);
    if (role === "employee")
      conversationQuery = conversationQuery.eq("assigned_to", context.userId);
    const { data: conversation, error: accessError } = await conversationQuery.maybeSingle();
    if (accessError || !conversation) throw new Error("Conversation not found or access denied.");
    const { data: rows, error } = await (supabaseAdmin as any)
      .from("whatsapp_messages")
      .select("id,direction,status,body,created_at,sent_at,delivered_at,read_at")
      .eq("agency_id", agencyId)
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw new Error("Unable to load this conversation.");
    return { messages: rows ?? [] };
  });

export const markWhatsappConversationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => conversationInput.parse(input))
  .handler(async ({ context, data }) => {
    const { agencyId, conversation, supabaseAdmin } = await getAccessibleWhatsappConversation(
      context.supabase,
      context.userId,
      data.conversationId,
    );
    const { error } = await (supabaseAdmin as any)
      .from("whatsapp_conversations")
      .update({ unread_count: 0 })
      .eq("id", conversation.id)
      .eq("agency_id", agencyId);
    if (error) throw new Error("Unable to mark the conversation read.");
    return { read: true as const };
  });

export const resumeWhatsappAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => conversationInput.parse(input))
  .handler(async ({ context, data }) => {
    const { agencyId, conversation } = await getAdminConversation(
      context.supabase,
      context.userId,
      data.conversationId,
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("whatsapp_conversations")
      .update({ ai_paused_at: null, handoff_reason: null })
      .eq("id", conversation.id)
      .eq("agency_id", agencyId);
    if (error) throw new Error("Unable to resume AI for this conversation.");
    return { resumed: true as const };
  });

export const sendWhatsappReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => sendInput.parse(input))
  .handler(async ({ context, data }) => {
    if (process.env["WHATSAPP_LIVE_SEND"] !== "true") {
      throw new Error("WhatsApp live sending is disabled for this deployment.");
    }
    const { conversation, supabaseAdmin } = await getAccessibleWhatsappConversation(
      context.supabase,
      context.userId,
      data.conversationId,
    );
    if (conversation.whatsapp_connections?.state !== "connected") {
      throw new Error("The agency WhatsApp number is disconnected.");
    }
    if (
      !conversation.window_expires_at ||
      Date.parse(conversation.window_expires_at) <= Date.now()
    ) {
      throw new Error(
        "The 24-hour customer-service window has expired. Use an approved WhatsApp template to follow up.",
      );
    }
    const contact = conversation.whatsapp_contacts;
    if (!contact?.phone) throw new Error("Customer phone number is missing.");
    if (contact.opt_in_status === "opted_out") {
      throw new Error(
        "This customer opted out of WhatsApp messages. Record a new explicit opt-in before replying.",
      );
    }

    const db = supabaseAdmin as any;
    const idempotencyKey = `manual:${data.requestId}`;
    const { data: previousMessage, error: previousError } = await db
      .from("whatsapp_messages")
      .select("id,status,provider_message_id")
      .eq("conversation_id", conversation.id)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (previousError) throw new Error("Could not check the previous WhatsApp send attempt.");
    if (previousMessage?.status === "sent" && previousMessage.provider_message_id) {
      return { sent: true as const, messageId: previousMessage.id };
    }
    if (previousMessage) {
      throw new Error(
        "This send attempt has no confirmed delivery result. Check WhatsApp before starting another send.",
      );
    }
    const { data: message, error: insertError } = await db
      .from("whatsapp_messages")
      .insert({
        agency_id: conversation.agency_id,
        connection_id: conversation.connection_id,
        conversation_id: conversation.id,
        contact_id: conversation.contact_id,
        direction: "outbound",
        status: "pending",
        idempotency_key: idempotencyKey,
        body: data.body,
      })
      .select("id")
      .single();
    if (insertError || !message) throw new Error("Could not queue the reply.");

    try {
      const { data: usageResult, error: usageError } = await db.rpc("reserve_agency_usage", {
        _agency_id: conversation.agency_id,
        _metric_keys: ["whatsapp_messages"],
        _event_key: idempotencyKey,
      });
      const usage = Array.isArray(usageResult) ? usageResult[0] : usageResult;
      if (usageError) throw new Error("Could not verify the agency WhatsApp usage limit.");
      if (!usage?.allowed) {
        throw new Error(usage?.reason ?? "The agency has reached its WhatsApp message limit.");
      }

      const { data: credential } = await db
        .from("whatsapp_credentials")
        .select("ciphertext,iv,auth_tag")
        .eq("connection_id", conversation.connection_id)
        .single();
      if (!credential) throw new Error("WhatsApp credentials are unavailable.");
      const { sendMetaTextMessage } = await import("@/lib/whatsapp-meta.server");
      const result = await sendMetaTextMessage({
        phoneNumberId: conversation.whatsapp_connections.phone_number_id,
        tokenRow: credential,
        recipient: String(contact.phone).replace(/^\+/, ""),
        text: data.body,
      });
      const providerMessageId = result.messages?.[0]?.id;
      if (!providerMessageId) {
        throw new Error("Meta accepted no message identifier. Check WhatsApp before trying again.");
      }
      const now = new Date().toISOString();
      const { error: updateError } = await db
        .from("whatsapp_messages")
        .update({
          status: "sent",
          provider_message_id: providerMessageId,
          sent_at: now,
        })
        .eq("id", message.id);
      if (updateError) throw new Error("Message sent, but the delivery state could not be saved.");
      await db
        .from("whatsapp_conversations")
        .update({ last_message_at: now })
        .eq("id", conversation.id);
      return { sent: true as const, messageId: message.id };
    } catch {
      await db
        .from("whatsapp_messages")
        .update({
          status: "failed",
          error_message: "Message send failed; check connection and sending eligibility.",
          failed_at: new Date().toISOString(),
        })
        .eq("id", message.id);
      throw new Error("Message could not be sent. Check connection and sending eligibility.");
    }
  });

const assignmentInput = z.object({
  conversationId: z.string().uuid(),
  assigneeId: z.string().uuid().nullable(),
});

export const assignWhatsappConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => assignmentInput.parse(input))
  .handler(async ({ context, data }) => {
    const agencyId = await requireAgencyAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.assigneeId) {
      const { data: member, error: memberError } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .eq("user_id", data.assigneeId)
        .eq("agency_id", agencyId)
        .eq("role", "employee")
        .maybeSingle();
      if (memberError || !member) throw new Error("Choose an employee in this agency.");
      const { data: profile, error: profileError } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("id", data.assigneeId)
        .eq("agency_id", agencyId)
        .eq("status", "active")
        .maybeSingle();
      if (profileError || !profile) throw new Error("Choose an active employee in this agency.");
    }
    const { data: current, error: currentError } = await (supabaseAdmin as any)
      .from("whatsapp_conversations")
      .select("id,assigned_to")
      .eq("id", data.conversationId)
      .eq("agency_id", agencyId)
      .maybeSingle();
    if (currentError || !current)
      throw new Error("Conversation not found or assignment could not be saved.");
    let updateQuery = (supabaseAdmin as any)
      .from("whatsapp_conversations")
      .update({ assigned_to: data.assigneeId })
      .eq("id", data.conversationId)
      .eq("agency_id", agencyId);
    updateQuery = current.assigned_to
      ? updateQuery.eq("assigned_to", current.assigned_to)
      : updateQuery.is("assigned_to", null);
    const { data: updated, error } = await updateQuery
      .select("id,contact_id,assigned_to")
      .maybeSingle();
    if (error || !updated)
      throw new Error("Conversation not found or assignment could not be saved.");
    if (
      updated.assigned_to &&
      updated.assigned_to !== context.userId &&
      updated.assigned_to !== current.assigned_to
    ) {
      const { notifyUser } = await import("@/lib/notifications.functions");
      await notifyUser(supabaseAdmin, {
        userId: updated.assigned_to,
        agencyId,
        type: "whatsapp_assigned",
        title: "WhatsApp conversation assigned to you",
        body: "A customer conversation needs your attention.",
        entityType: "whatsapp_conversation",
        entityId: updated.id,
      });
    }
    return { assigned: true as const };
  });

const consentInput = z.object({
  conversationId: z.string().uuid(),
  source: z.string().trim().min(3).max(240),
  confirmed: z.literal(true),
});
const followupInput = z.object({
  conversationId: z.string().uuid(),
  dueAt: z.string().datetime(),
  mode: z.enum(["freeform", "template"]),
  body: z.string().trim().max(4000).optional(),
  templateName: z.string().trim().min(1).max(512).optional(),
  templateLanguage: z
    .string()
    .trim()
    .regex(/^[a-z]{2,3}(?:_[A-Z]{2})?$/)
    .optional(),
});

async function getAdminConversation(supabase: any, userId: string, conversationId: string) {
  const agencyId = await requireAgencyAdmin(supabase, userId);
  const { data, error } = await supabase
    .from("whatsapp_conversations")
    .select(
      "id,agency_id,connection_id,contact_id,window_expires_at,whatsapp_contacts(id,phone,opt_in_status),whatsapp_connections(phone_number_id,state)",
    )
    .eq("id", conversationId)
    .eq("agency_id", agencyId)
    .maybeSingle();
  if (error || !data) throw new Error("Conversation not found or access denied.");
  return { agencyId, conversation: data };
}

export const recordWhatsappConsent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => consentInput.parse(input))
  .handler(async ({ context, data }) => {
    const { agencyId, conversation } = await getAdminConversation(
      context.supabase,
      context.userId,
      data.conversationId,
    );
    const contact = Array.isArray(conversation.whatsapp_contacts)
      ? conversation.whatsapp_contacts[0]
      : conversation.whatsapp_contacts;
    if (!contact?.id) throw new Error("Customer contact not found.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("whatsapp_contacts")
      .update({
        opt_in_status: "opted_in",
        opt_in_source: data.source,
        opt_in_at: new Date().toISOString(),
        opt_in_recorded_by: context.userId,
        opted_out_at: null,
        opt_out_keyword: null,
      })
      .eq("id", contact.id)
      .eq("agency_id", agencyId);
    if (error) throw new Error("Could not save the customer's WhatsApp permission record.");
    return { recorded: true as const };
  });

export const scheduleWhatsappFollowup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => followupInput.parse(input))
  .handler(async ({ context, data }) => {
    const { agencyId, conversation } = await getAdminConversation(
      context.supabase,
      context.userId,
      data.conversationId,
    );
    const contact = Array.isArray(conversation.whatsapp_contacts)
      ? conversation.whatsapp_contacts[0]
      : conversation.whatsapp_contacts;
    if (conversation.whatsapp_connections?.state !== "connected") {
      throw new Error("The agency WhatsApp number is disconnected.");
    }
    if (contact?.opt_in_status !== "opted_in") {
      throw new Error("Record the customer's explicit WhatsApp opt-in before scheduling.");
    }
    const dueAt = new Date(data.dueAt);
    if (!Number.isFinite(dueAt.getTime()) || dueAt.getTime() < Date.now() + 60_000) {
      throw new Error("Choose a follow-up time at least one minute in the future.");
    }
    if (dueAt.getTime() > Date.now() + 365 * 24 * 60 * 60_000) {
      throw new Error("Follow-ups can be scheduled up to one year ahead.");
    }
    if (data.mode === "freeform") {
      if (!data.body?.trim()) throw new Error("Enter a follow-up message.");
      if (
        !conversation.window_expires_at ||
        dueAt.getTime() > Date.parse(conversation.window_expires_at)
      ) {
        throw new Error(
          "This time is outside the 24-hour service window. Schedule an approved template instead.",
        );
      }
    } else if (!data.templateName?.trim() || !data.templateLanguage) {
      throw new Error("Choose an approved template name and language code.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: followup, error } = await (supabaseAdmin as any)
      .from("whatsapp_scheduled_followups")
      .insert({
        agency_id: agencyId,
        connection_id: conversation.connection_id,
        conversation_id: conversation.id,
        contact_id: conversation.contact_id,
        created_by: context.userId,
        due_at: dueAt.toISOString(),
        mode: data.mode,
        body: data.mode === "freeform" ? data.body!.trim() : null,
        template_name: data.mode === "template" ? data.templateName!.trim() : null,
        template_language: data.mode === "template" ? data.templateLanguage : null,
      })
      .select("id")
      .single();
    if (error || !followup) throw new Error("Could not schedule WhatsApp follow-up.");
    return { id: followup.id as string, dueAt: dueAt.toISOString() };
  });

export const listWhatsappFollowups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => conversationInput.parse(input))
  .handler(async ({ context, data }) => {
    const { agencyId } = await getAdminConversation(
      context.supabase,
      context.userId,
      data.conversationId,
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: followups, error } = await (supabaseAdmin as any)
      .from("whatsapp_scheduled_followups")
      .select("id,due_at,mode,body,template_name,template_language,status,last_error,sent_at")
      .eq("agency_id", agencyId)
      .eq("conversation_id", data.conversationId)
      .order("due_at", { ascending: false })
      .limit(20);
    if (error) throw new Error("Unable to load scheduled follow-ups.");
    return { followups: followups ?? [] };
  });

export const cancelWhatsappFollowup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ ...conversationInput.shape, followupId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { agencyId } = await getAdminConversation(
      context.supabase,
      context.userId,
      data.conversationId,
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: cancelled, error } = await (supabaseAdmin as any)
      .from("whatsapp_scheduled_followups")
      .update({ status: "cancelled" })
      .eq("id", data.followupId)
      .eq("agency_id", agencyId)
      .eq("conversation_id", data.conversationId)
      .eq("status", "scheduled")
      .select("id")
      .maybeSingle();
    if (error || !cancelled) throw new Error("Follow-up not found or no longer cancellable.");
    return { cancelled: true as const };
  });
