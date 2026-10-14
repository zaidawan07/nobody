import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const conversationIdSchema = z.object({ conversationId: z.string().uuid() });
const assignSchema = z.object({
  conversationId: z.string().uuid(),
  assignedTo: z.string().uuid().nullable(),
});
const internalNoteSchema = z.object({
  conversationId: z.string().uuid(),
  body: z.string().trim().min(1).max(2000),
});

async function getActiveAgency(context: { supabase: any; userId: string }) {
  const { data: actor, error } = await context.supabase
    .from("profiles")
    .select("agency_id,status")
    .eq("id", context.userId)
    .maybeSingle();

  if (error || !actor?.agency_id || actor.status !== "active") {
    throw new Error("An active agency member is required.");
  }

  return actor.agency_id as string;
}

async function assertConversationInAgency(
  admin: any,
  conversationId: string,
  agencyId: string,
) {
  const { data, error } = await admin
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("agency_id", agencyId)
    .maybeSingle();
  if (error || !data) throw new Error("Conversation not found in your agency.");
}

export const markConversationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => conversationIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const agencyId = await getActiveAgency(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertConversationInAgency(supabaseAdmin, data.conversationId, agencyId);

    const { error } = await supabaseAdmin
      .from("conversations")
      .update({ unread_count: 0, last_read_at: new Date().toISOString() })
      .eq("id", data.conversationId)
      .eq("agency_id", agencyId);
    if (error) throw new Error("Could not mark the conversation as read.");
    return { ok: true };
  });

export const assignConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => assignSchema.parse(input))
  .handler(async ({ data, context }) => {
    const agencyId = await getActiveAgency(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertConversationInAgency(supabaseAdmin, data.conversationId, agencyId);

    if (data.assignedTo) {
      const { data: assignee, error: assigneeError } = await supabaseAdmin
        .from("profiles")
        .select("id,agency_id,status")
        .eq("id", data.assignedTo)
        .maybeSingle();
      if (assigneeError || !assignee || assignee.agency_id !== agencyId || assignee.status !== "active") {
        throw new Error("Choose an active team member from your agency.");
      }
    }

    const { error } = await supabaseAdmin
      .from("conversations")
      .update({ assigned_to: data.assignedTo })
      .eq("id", data.conversationId)
      .eq("agency_id", agencyId);
    if (error) throw new Error("Could not assign the conversation.");
    return { ok: true };
  });

export const createInternalNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => internalNoteSchema.parse(input))
  .handler(async ({ data, context }) => {
    const agencyId = await getActiveAgency(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertConversationInAgency(supabaseAdmin, data.conversationId, agencyId);

    const { error } = await supabaseAdmin.from("conversation_messages").insert({
      agency_id: agencyId,
      conversation_id: data.conversationId,
      sender: "system",
      message_kind: "internal_note",
      body: data.body.trim(),
      created_by: context.userId,
    });
    if (error) throw new Error("Could not save the internal note.");
    return { ok: true };
  });
