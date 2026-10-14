import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
type AdminClient = SupabaseClient<any, "public", any>;

type WebhookEvent = {
  id: string;
  agency_id: string;
  phone_number_id: string;
  payload: {
    entry?: Array<{
      changes?: Array<{
        value?: {
          metadata?: { phone_number_id?: string };
          contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
          messages?: Array<Record<string, unknown>>;
          statuses?: Array<Record<string, unknown>>;
        };
      }>;
    }>;
  };
  attempts: number;
};

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 10;
const STALE_LOCK_MS = 5 * 60 * 1000;

const isoTimestamp = (value: unknown) => {
  const seconds = typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : new Date().toISOString();
};

function messageBody(message: Record<string, unknown>): string | null {
  const text = message.text as { body?: unknown } | undefined;
  const button = message.button as { text?: unknown } | undefined;
  const interactive = message.interactive as { button_reply?: { title?: unknown }; list_reply?: { title?: unknown } } | undefined;
  const image = message.image as { caption?: unknown } | undefined;
  const document = message.document as { caption?: unknown } | undefined;
  const candidates = [text?.body, button?.text, interactive?.button_reply?.title, interactive?.list_reply?.title, image?.caption, document?.caption];
  const found = candidates.find((value) => typeof value === "string");
  return typeof found === "string" ? found.slice(0, 20_000) : null;
}

async function findOrCreateConversation(admin: AdminClient, event: WebhookEvent, phone: string, name: string | null, timestamp: string) {
  const { data: existing, error: findError } = await admin
    .from("conversations")
    .select("id,state,handoff_requested")
    .eq("agency_id", event.agency_id)
    .eq("customer_phone", phone)
    .maybeSingle();
  if (findError) throw new Error("Could not look up the customer conversation.");
  if (existing) {
    const update: Record<string, unknown> = { last_message_at: timestamp, last_customer_message_at: timestamp };
    if (name) update.customer_name = name;
    const { error } = await admin.from("conversations").update(update).eq("id", existing.id);
    if (error) throw new Error("Could not update the customer conversation.");
    return existing;
  }
  const { data: created, error: createError } = await admin.from("conversations").insert({
    agency_id: event.agency_id,
    customer_phone: phone,
    customer_name: name,
    state: "ai_active",
    last_message_at: timestamp,
    last_customer_message_at: timestamp,
  }).select("id,state,handoff_requested").single();
  if (!createError && created) return created;
  if (createError?.code === "23505") {
    const { data: raced, error: raceError } = await admin
      .from("conversations")
      .select("id,state,handoff_requested")
      .eq("agency_id", event.agency_id)
      .eq("customer_phone", phone)
      .single();
    if (!raceError && raced) return raced;
  }
  throw new Error("Could not create the customer conversation.");
}

async function processEvent(admin: AdminClient, event: WebhookEvent) {
  for (const entry of event.payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value || value.metadata?.phone_number_id !== event.phone_number_id) continue;

      for (const message of value.messages ?? []) {
        const providerMessageId = typeof message.id === "string" ? message.id : "";
        const from = typeof message.from === "string" ? message.from : "";
        if (!providerMessageId || !/^\d{5,30}$/.test(from)) continue;
        const timestamp = isoTimestamp(message.timestamp);
        const contact = (value.contacts ?? []).find((item) => item.wa_id === from);
        const contactName = typeof contact?.profile?.name === "string" ? contact.profile.name.slice(0, 200) : null;
        const conversation = await findOrCreateConversation(admin, event, from, contactName, timestamp);
        const kind = typeof message.type === "string" ? message.type : "unknown";
        const body = messageBody(message);
        const { error } = await admin.from("conversation_messages").upsert({
          agency_id: event.agency_id,
          conversation_id: conversation.id,
          sender: "customer",
          body,
          provider_message_id: providerMessageId,
          provider_status: "received",
          created_at: timestamp,
        }, { onConflict: "provider_message_id", ignoreDuplicates: true });
        if (error) throw new Error("Could not persist an incoming WhatsApp message.");
        const normalizedBody = body?.trim().toLocaleUpperCase();
        const optOutKeywords = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "REMOVE", "بند", "روکیں"]);
        if (normalizedBody && optOutKeywords.has(normalizedBody)) {
          const { error: optOutError } = await admin.from("conversations").update({ opted_out_at: timestamp, opt_out_reason: (body ?? "").slice(0, 200), state: "closed", handoff_requested: false }).eq("id", conversation.id).eq("agency_id", event.agency_id);
          if (optOutError) throw new Error("Could not persist the customer opt-out request.");
        }
        if (kind === "unknown") console.info("Stored WhatsApp message with an unsupported message type.");
      }

      for (const statusItem of value.statuses ?? []) {
        const providerMessageId = typeof statusItem.id === "string" ? statusItem.id : "";
        const status = typeof statusItem.status === "string" ? statusItem.status : "";
        if (!providerMessageId || !["sent", "delivered", "read", "failed"].includes(status)) continue;
        const timestamp = isoTimestamp(statusItem.timestamp);
        const update: Record<string, unknown> = { provider_status: status };
        if (status === "sent") update.sent_at = timestamp;
        if (status === "delivered") update.delivered_at = timestamp;
        if (status === "read") update.read_at = timestamp;
        if (status === "failed") {
          update.failed_at = timestamp;
          const errors = Array.isArray(statusItem.errors) ? statusItem.errors as Array<{ code?: unknown; title?: unknown; message?: unknown }> : [];
          const first = errors[0];
          if (first?.code !== undefined) update.error_code = String(first.code).slice(0, 100);
          const description = typeof first?.title === "string" ? first.title : typeof first?.message === "string" ? first.message : "";
          if (description) update.error_message = description.slice(0, 500);
        }
        const { error } = await admin.from("conversation_messages").update(update).eq("provider_message_id", providerMessageId).eq("agency_id", event.agency_id);
        if (error) throw new Error("Could not update WhatsApp delivery status.");
      }
    }
  }
}

Deno.serve(async (request) => {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) return new Response("Worker is not configured.", { status: 503 });
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (request.headers.get("authorization") !== "Bearer " + serviceRoleKey) {
    return new Response("Unauthorized", { status: 401 });
  }

  const admin = createClient<any, "public", any>(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const now = new Date();
  const nowIso = now.toISOString();
  const staleBefore = new Date(now.getTime() - STALE_LOCK_MS).toISOString();

  // Recover work abandoned by a crashed/timed-out worker. A stale event may be
  // reclaimed by only one worker because the subsequent claim is conditional.
  const { error: recoveryError } = await admin
    .from("whatsapp_webhook_events")
    .update({ status: "received", locked_at: null, next_attempt_at: nowIso, last_error: "Recovered stale worker claim." })
    .eq("status", "processing")
    .lt("locked_at", staleBefore);
  if (recoveryError) return new Response("Queue recovery failed", { status: 500 });

  const { data: queued, error: queueError } = await admin
    .from("whatsapp_webhook_events")
    .select("id,agency_id,phone_number_id,payload,attempts")
    .eq("status", "received")
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`)
    .order("received_at", { ascending: true })
    .limit(BATCH_SIZE);
  if (queueError) return new Response("Queue read failed", { status: 500 });

  let processed = 0;
  for (const candidate of (queued ?? []) as WebhookEvent[]) {
    const nextAttempt = candidate.attempts + 1;
    const claimedAt = new Date().toISOString();
    const { data: claimed, error: claimError } = await admin
      .from("whatsapp_webhook_events")
      .update({ status: "processing", attempts: nextAttempt, locked_at: claimedAt, next_attempt_at: null })
      .eq("id", candidate.id)
      .eq("status", "received")
      .select("id")
      .maybeSingle();
    if (claimError || !claimed) continue;

    try {
      await processEvent(admin, candidate);
      const { error } = await admin.from("whatsapp_webhook_events")
        .update({ status: "processed", processed_at: new Date().toISOString(), last_error: null, payload: {}, locked_at: null, next_attempt_at: null })
        .eq("id", candidate.id)
        .eq("status", "processing");
      if (error) throw new Error("Could not finalize the webhook event.");
      processed += 1;
    } catch (error) {
      const safeMessage = error instanceof Error ? error.message.slice(0, 500) : "Unknown processing error.";
      const exhausted = nextAttempt >= MAX_ATTEMPTS;
      const retryDelaySeconds = Math.min(60 * 2 ** (nextAttempt - 1), 3600);
      await admin.from("whatsapp_webhook_events")
        .update({
          status: exhausted ? "failed" : "received",
          locked_at: null,
          next_attempt_at: exhausted ? null : new Date(Date.now() + retryDelaySeconds * 1000).toISOString(),
          dead_lettered_at: exhausted ? new Date().toISOString() : null,
          last_error: safeMessage,
        })
        .eq("id", candidate.id)
        .eq("status", "processing");
      console.error("WhatsApp webhook event processing failed; retry count:", nextAttempt);
    }
  }

  return Response.json({ processed });
});
