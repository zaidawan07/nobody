/* eslint-disable @typescript-eslint/no-explicit-any -- Follow-up tables are introduced by pending local migrations and are not yet present in the generated Supabase Database type. */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { getSafeFollowupRetryAt, PermanentFollowupError } from "@/lib/whatsapp-followup-retry";

export const Route = createFileRoute("/api/cron/whatsapp-followups")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authError = await authenticateCronRequest(request);
        if (authError) return authError;
        if (process.env["WHATSAPP_LIVE_SEND"] !== "true") {
          return Response.json({ ok: true, liveSend: false, processed: 0 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const db = supabaseAdmin as any;
        const nowMs = Date.now();
        const now = new Date(nowMs).toISOString();
        const staleBefore = new Date(nowMs - 2 * 60_000).toISOString();
        const [scheduledResult, staleResult] = await Promise.all([
          db
            .from("whatsapp_scheduled_followups")
            .select("*")
            .eq("status", "scheduled")
            .lte("due_at", now)
            .order("due_at", { ascending: true })
            .limit(25),
          db
            .from("whatsapp_scheduled_followups")
            .select("*")
            .eq("status", "processing")
            .lte("due_at", now)
            .lt("updated_at", staleBefore)
            .order("due_at", { ascending: true })
            .limit(25),
        ]);
        if (scheduledResult.error || staleResult.error) {
          return Response.json({ ok: false }, { status: 500 });
        }
        const due = [...(scheduledResult.data ?? []), ...(staleResult.data ?? [])];

        let sent = 0;
        let failed = 0;
        for (const item of due ?? []) {
          const claimTime = new Date().toISOString();
          let claimQuery = db
            .from("whatsapp_scheduled_followups")
            .update({
              status: "processing",
              attempts: Number(item.attempts ?? 0) + 1,
              updated_at: claimTime,
            })
            .eq("id", item.id)
            .eq("status", item.status);
          if (item.status === "processing") {
            claimQuery = claimQuery.eq("updated_at", item.updated_at).lt("updated_at", staleBefore);
          }
          const { data: claimed } = await claimQuery.select("id").maybeSingle();
          if (!claimed) continue;

          let outboundId: string | null = null;
          let providerRequestStarted = false;
          try {
            const idempotencyKey = `followup:${item.id}`;
            const { data: existingMessage, error: existingMessageError } = await db
              .from("whatsapp_messages")
              .select("id,status,provider_message_id")
              .eq("idempotency_key", idempotencyKey)
              .maybeSingle();
            if (existingMessageError) throw new Error("Could not check prior follow-up delivery.");
            if (existingMessage) {
              if (existingMessage.status === "sent" && existingMessage.provider_message_id) {
                await db
                  .from("whatsapp_scheduled_followups")
                  .update({
                    status: "sent",
                    message_id: existingMessage.id,
                    sent_at: now,
                    updated_at: now,
                  })
                  .eq("id", item.id)
                  .eq("status", "processing");
                sent += 1;
                continue;
              }

              const reviewMessage =
                existingMessage.status === "failed"
                  ? "A previous send failed. Check its delivery error before scheduling another attempt."
                  : "A previous send has no confirmed result. Check WhatsApp before scheduling another attempt.";
              await db
                .from("whatsapp_scheduled_followups")
                .update({
                  status: "failed",
                  message_id: existingMessage.id,
                  last_error: reviewMessage,
                  updated_at: now,
                })
                .eq("id", item.id)
                .eq("status", "processing");
              failed += 1;
              continue;
            }

            const [{ data: connection }, { data: contact }] = await Promise.all([
              db
                .from("whatsapp_connections")
                .select("id,phone_number_id,state")
                .eq("id", item.connection_id)
                .eq("agency_id", item.agency_id)
                .maybeSingle(),
              db
                .from("whatsapp_contacts")
                .select("id,phone,opt_in_status")
                .eq("id", item.contact_id)
                .eq("agency_id", item.agency_id)
                .maybeSingle(),
            ]);
            if (!connection || connection.state !== "connected")
              throw new PermanentFollowupError("Agency WhatsApp number is disconnected.");
            if (!contact || contact.opt_in_status !== "opted_in")
              throw new PermanentFollowupError("Customer WhatsApp opt-in is missing or withdrawn.");
            if (item.mode === "freeform" && (!item.body || Date.parse(item.due_at) > Date.now())) {
              throw new PermanentFollowupError("Scheduled free-form message is invalid.");
            }
            const { data: conversation } = await db
              .from("whatsapp_conversations")
              .select("window_expires_at")
              .eq("id", item.conversation_id)
              .maybeSingle();
            const windowOpen = Boolean(
              conversation?.window_expires_at &&
              Date.parse(conversation.window_expires_at) > Date.now(),
            );
            if (item.mode === "freeform" && !windowOpen) {
              throw new PermanentFollowupError(
                "The 24-hour customer-service window closed before this follow-up was sent.",
              );
            }

            const { data: usageResult, error: usageError } = await db.rpc("reserve_agency_usage", {
              _agency_id: item.agency_id,
              _metric_keys: ["whatsapp_messages"],
              _event_key: idempotencyKey,
            });
            const usage = Array.isArray(usageResult) ? usageResult[0] : usageResult;
            if (usageError) throw new Error("Could not verify the agency WhatsApp usage limit.");
            if (!usage?.allowed) {
              throw new PermanentFollowupError(
                usage?.reason ?? "The agency has reached its WhatsApp message limit.",
              );
            }

            const { data: credential } = await db
              .from("whatsapp_credentials")
              .select("ciphertext,iv,auth_tag")
              .eq("connection_id", item.connection_id)
              .single();
            if (!credential) throw new Error("WhatsApp credentials are unavailable.");
            const { decryptWhatsappToken } = await import("@/lib/whatsapp-crypto.server");
            await decryptWhatsappToken(credential);

            const { data: outbound, error: outboundError } = await db
              .from("whatsapp_messages")
              .insert({
                agency_id: item.agency_id,
                connection_id: item.connection_id,
                conversation_id: item.conversation_id,
                contact_id: item.contact_id,
                direction: "outbound",
                status: "pending",
                idempotency_key: idempotencyKey,
                body:
                  item.mode === "freeform"
                    ? item.body
                    : `[WhatsApp template: ${item.template_name}]`,
                template_name: item.mode === "template" ? item.template_name : null,
              })
              .select("id")
              .single();
            if (outboundError || !outbound)
              throw new Error("Could not reserve WhatsApp follow-up delivery.");
            outboundId = outbound.id;

            const { sendMetaTemplateMessage, sendMetaTextMessage } =
              await import("@/lib/whatsapp-meta.server");
            providerRequestStarted = true;
            const result =
              item.mode === "template"
                ? await sendMetaTemplateMessage({
                    phoneNumberId: connection.phone_number_id,
                    tokenRow: credential,
                    recipient: String(contact.phone).replace(/^\+/, ""),
                    templateName: item.template_name,
                    language: item.template_language,
                  })
                : await sendMetaTextMessage({
                    phoneNumberId: connection.phone_number_id,
                    tokenRow: credential,
                    recipient: String(contact.phone).replace(/^\+/, ""),
                    text: item.body,
                  });
            const providerMessageId = result.messages?.[0]?.id ?? null;
            if (!providerMessageId) throw new Error("Meta accepted no message identifier.");
            const sentAt = new Date().toISOString();
            await db
              .from("whatsapp_messages")
              .update({
                status: "sent",
                provider_message_id: providerMessageId,
                sent_at: sentAt,
              })
              .eq("id", outbound.id);
            await db
              .from("whatsapp_conversations")
              .update({ last_message_at: sentAt })
              .eq("id", item.conversation_id);
            await db
              .from("whatsapp_scheduled_followups")
              .update({
                status: "sent",
                message_id: outbound.id,
                sent_at: sentAt,
                last_error: null,
                updated_at: sentAt,
              })
              .eq("id", item.id);
            sent += 1;
          } catch (error) {
            const attempt = Number(item.attempts ?? 0) + 1;
            let retryAt =
              providerRequestStarted || error instanceof PermanentFollowupError
                ? null
                : getSafeFollowupRetryAt(attempt);
            const message = providerRequestStarted
              ? "Provider send outcome is uncertain; manual review is required."
              : error instanceof PermanentFollowupError
                ? "Follow-up is not eligible to send because consent, service-window, connection, or usage rules blocked it."
                : "Follow-up preparation failed.";
            if (outboundId && retryAt) {
              // The provider has not been contacted, so removing this pending
              // reservation lets the same idempotency key be used on retry.
              const { error: cleanupError } = await db
                .from("whatsapp_messages")
                .delete()
                .eq("id", outboundId)
                .eq("status", "pending");
              if (cleanupError) retryAt = null;
            }
            if (outboundId && !retryAt) {
              await db
                .from("whatsapp_messages")
                .update({
                  status: "failed",
                  error_message: message,
                  failed_at: new Date().toISOString(),
                })
                .eq("id", outboundId);
            }
            await db
              .from("whatsapp_scheduled_followups")
              .update({
                status: retryAt ? "scheduled" : "failed",
                due_at: retryAt?.toISOString() ?? item.due_at,
                message_id: retryAt ? null : outboundId,
                last_error: retryAt
                  ? `${message} Automatic retry ${attempt + 1}/${3} scheduled.`
                  : message,
                updated_at: new Date().toISOString(),
              })
              .eq("id", item.id);
            failed += 1;
          }
        }
        return Response.json({ ok: true, processed: sent + failed, sent, failed });
      },
    },
  },
});
