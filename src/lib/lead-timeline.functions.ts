import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Lead timeline and follow-ups.
//
// Writes go through the caller's own RLS-bound connection, so
// can_access_assigned_lead (migration 0015) is the boundary: an employee can
// only add to a lead assigned to them, an agency admin to any lead in their
// agency, and the super admin to none. There is deliberately no service-role
// path here -- nothing on these two tables needs one.
//
// notification.functions.ts owns the notification insert; it is called from the
// follow-up assignment so the assignee hears about it.

const activityTypes = ["note", "call", "status_change", "visit", "assignment", "system"] as const;

const addActivitySchema = z.object({
  leadId: z.string().uuid(),
  type: z.enum(activityTypes),
  body: z.string().trim().max(4000).optional(),
  // Free-form extra context, stored as jsonb. Must be a JSON object.
  metadata: z.record(z.unknown()).optional(),
});

const createFollowupSchema = z.object({
  leadId: z.string().uuid(),
  dueAt: z.string().datetime(),
  note: z.string().trim().max(1000).optional(),
  // NULL is allowed: a follow-up can belong to the agency rather than a person.
  assignedTo: z.string().uuid().nullable().optional(),
});

const updateFollowupSchema = z.object({
  followupId: z.string().uuid(),
  status: z.enum(["open", "done", "cancelled"]),
});

/** Adds a timeline entry. The trigger derives agency_id from the lead. */
export const addLeadActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(addActivitySchema)
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: row, error } = await supabase
      .from("lead_activities")
      .insert({
        lead_id: data.leadId,
        type: data.type,
        body: data.body ?? null,
        author_id: context.userId,
        metadata: (data.metadata ?? {}) as never,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

/** Creates a follow-up and, when it is assigned to somebody else, notifies them. */
export const createLeadFollowup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(createFollowupSchema)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: row, error } = await supabase
      .from("lead_followups")
      .insert({
        lead_id: data.leadId,
        due_at: data.dueAt,
        note: data.note ?? null,
        assigned_to: data.assignedTo ?? null,
        created_by: userId,
      })
      .select("id, agency_id, lead_id, assigned_to, due_at, note")
      .single();
    if (error) throw new Error(error.message);

    // Notify the assignee -- but never when they just assigned it to themselves.
    // The recipient is read from the row inside notifyAssignment, so it cannot be
    // steered by this request.
    const assignee = row.assigned_to as string | null;
    if (assignee && assignee !== userId) {
      const { notifyAssignment } = await import("@/lib/notifications.functions");
      await notifyAssignment({
        data: { event: "followup_assigned", entityId: row.id as string },
      });
    }

    return { id: row.id as string };
  });

/** Opens, completes or cancels a follow-up. Client may only touch status. */
export const updateLeadFollowup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(updateFollowupSchema)
  .handler(async ({ data, context }) => {
    const now = new Date().toISOString();
    const { error } = await context.supabase
      .from("lead_followups")
      .update({
        status: data.status,
        completed_at: data.status === "done" ? now : null,
        cancelled_at: data.status === "cancelled" ? now : null,
      })
      .eq("id", data.followupId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
