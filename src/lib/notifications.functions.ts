import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { TablesInsert } from "@/integrations/supabase/types";

// In-app notifications.
//
// Reads and mark-read run through the caller's own connection, so migration
// 0009's RLS (user_id = auth.uid()) is the boundary: one user can neither see
// nor mark another user's notifications.
//
// Creation runs as the service role, because a notification must be *about* a
// recipient other than the actor -- an agency admin assigning a lead must
// notify the assignee. The client therefore never supplies user_id; the
// server derives it from the row it just wrote.

const listSchema = z.object({
  limit: z.number().min(1).max(100).optional(),
  before: z.string().optional(),
});

/** The caller's own notifications, newest first, cursor-paginated on created_at. */
export const listNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => listSchema.parse(input))
  .handler(async ({ data, context }) => {
    const limit = data.limit ?? 30;

    let query = context.supabase
      .from("notifications")
      .select("id, type, title, body, entity_type, entity_id, read_at, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);
    if (data.before) query = query.lt("created_at", data.before);

    const { data: rows, error } = await query;
    if (error) throw new Error("The request could not be completed. Please try again.");
    const all = rows ?? [];
    return {
      items: all.slice(0, limit),
      nextCursor: all.length > limit ? (all[limit]?.created_at ?? null) : null,
    };
  });

/** Unread badge count. */
export const unreadNotificationCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { count, error } = await context.supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .is("read_at", null);
    if (error) throw new Error("The request could not be completed. Please try again.");
    return { count: count ?? 0 };
  });

const markSchema = z.object({ id: z.string().uuid() });

/** Mark one of the caller's own notifications read. */
export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => markSchema.parse(input))
  .handler(async ({ data, context }) => {
    // The RLS policy (USING user_id = auth.uid()) silently affects 0 rows for
    // someone else's row, which is indistinguishable from "already read".
    // Checking first lets us answer honestly instead of pretending success.
    const { data: owned } = await context.supabase
      .from("notifications")
      .select("id, read_at")
      .eq("id", data.id)
      .maybeSingle();
    if (!owned) throw new Error("Notification not found.");

    if (!owned.read_at) {
      const { error } = await context.supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", data.id);
      if (error) throw new Error("The request could not be completed. Please try again.");
    }
    return { ok: true };
  });

/** Mark every unread notification of the caller read. */
export const markAllNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", context.userId)
      .is("read_at", null);
    if (error) throw new Error("The request could not be completed. Please try again.");
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Client-callable creation.
//
// Leads and visits are written by the caller's own client connection so RLS is
// the boundary. Notifications must be written by the service role (0009 grants
// INSERT to nobody but service_role), so the row that the caller just wrote is
// validated here and the recipient is derived from it -- never taken from the
// request as an arbitrary user_id.
// ---------------------------------------------------------------------------

const eventSchema = z.object({
  event: z.enum(["lead_assigned", "visit_requested", "followup_assigned"]),
  /** The lead, visit, or follow-up row the caller just created or reassigned. */
  entityId: z.string().uuid(),
});

/**
 * Notifies the employee a lead or visit is assigned to.
 *
 * The recipient is read from the row itself, not from the request, so a caller
 * cannot make this notify someone of their choosing. Returns quietly if the
 * row is outside the caller's agency or no assignee is set -- the caller's own
 * write already succeeded, and a failed notification must not surface as a
 * failed save.
 */
export const notifyAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => eventSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.event === "lead_assigned") {
      const { data: lead } = await supabaseAdmin
        .from("leads")
        .select("id, agency_id, name, assigned_to")
        .eq("id", data.entityId)
        .maybeSingle();
      if (!lead?.assigned_to || !lead.agency_id) return { ok: true };
      // Never notify someone about a lead in an agency that is not theirs.
      if (lead.assigned_to === context.userId) return { ok: true };
      await notifyUser(supabaseAdmin, {
        userId: lead.assigned_to,
        agencyId: lead.agency_id,
        type: "lead_assigned",
        title: "Lead assigned to you",
        body: lead.name ?? "A lead",
        entityType: "lead",
        entityId: lead.id,
      });
      return { ok: true };
    }

    if (data.event === "followup_assigned") {
      const { data: followup } = await supabaseAdmin
        .from("lead_followups")
        .select("id, agency_id, assigned_to, due_at, note")
        .eq("id", data.entityId)
        .maybeSingle();
      if (!followup?.assigned_to || !followup.agency_id) return { ok: true };
      if (followup.assigned_to === context.userId) return { ok: true };
      await notifyUser(supabaseAdmin, {
        userId: followup.assigned_to,
        agencyId: followup.agency_id,
        type: "followup_assigned",
        title: "Follow-up assigned to you",
        body: followup.note ?? "You have a follow-up due",
        entityType: "lead_followup",
        entityId: followup.id,
      });
      return { ok: true };
    }

    const { data: visit } = await supabaseAdmin
      .from("site_visits")
      .select("id, agency_id, property_id, assigned_to")
      .eq("id", data.entityId)
      .maybeSingle();
    if (!visit?.assigned_to || !visit.agency_id) return { ok: true };
    if (visit.assigned_to === context.userId) return { ok: true };
    await notifyUser(supabaseAdmin, {
      userId: visit.assigned_to,
      agencyId: visit.agency_id,
      type: "visit_requested",
      title: "Site visit requested",
      body: "A site visit needs your attention",
      entityType: "site_visit",
      entityId: visit.id,
    });
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Creation. Service-role, server-internal only -- never exposed to a client,
// because the recipient must be derived from a trusted write rather than
// accepted from the request.
// ---------------------------------------------------------------------------

const notifySchema = z.object({
  userId: z.string().uuid(),
  agencyId: z.string().uuid().optional(),
  type: z.string().min(1).max(64),
  title: z.string().min(1).max(200),
  body: z.string().max(1000).optional(),
  entityType: z.string().max(64).optional(),
  entityId: z.string().uuid().optional(),
});

export interface NotifyInput {
  userId: string;
  agencyId?: string | undefined;
  type: string;
  title: string;
  body?: string | undefined;
  entityType?: string | undefined;
  entityId?: string | undefined;
}

/**
 * Creates one notification as the service role.
 *
 * Returns quietly on failure: a notification is never worth failing the write
 * that triggered it, and the caller has no way to recover from a notification
 * error anyway. Callers must not depend on the return value for correctness.
 */
export async function notifyUser(supabaseAdmin: SupabaseClient, input: NotifyInput): Promise<void> {
  const row: TablesInsert<"notifications"> = {
    user_id: input.userId,
    agency_id: input.agencyId ?? null,
    type: input.type,
    title: input.title,
    body: input.body ?? null,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
  };
  const { error } = await supabaseAdmin.from("notifications").insert(row);
  if (error) {
    console.error("[notifications] could not deliver notification");
  }
}

export { notifySchema };
