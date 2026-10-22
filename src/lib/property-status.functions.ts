import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isAvailableStatus, transitionError } from "@/lib/property-availability";

// Property status and availability, on the server.
//
// The UI previously decided availability with literals in six separate places,
// which is exactly how the meaning of 'available' drifts. Every path now
// routes through property-availability.ts, and this module refuses a transition
// the database guard would refuse anyway -- so a caller gets a readable error
// instead of a raw insufficient_privilege from the trigger.

const STATUSES = [
  "available",
  "reserved",
  "sold",
  "rented",
  "inactive",
  "draft",
  "unavailable",
  "expired",
] as const;

const statusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(STATUSES),
});

export interface PropertyStatusResult {
  ok: boolean;
  status: string;
  /** Set when the change was refused: plain English, from the module. */
  error?: string;
}

/**
 * Change a property's status.
 *
 * Runs as the caller's own connection, so RLS decides whether they may write
 * this row at all. This function additionally refuses a transition that is
 * not allowed even for someone who may write it -- which is what stops a stale
 * client that still holds an older status from reopening a sold listing.
 */
export const setPropertyStatusSafe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => statusSchema.parse(input))
  .handler(async ({ data, context }): Promise<PropertyStatusResult> => {
    const { data: current, error } = await context.supabase
      .from("properties")
      .select("status, agency_id")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error("The request could not be completed. Please try again.");
    // RLS: a caller from another agency sees no row rather than a wrong one.
    if (!current) throw new Error("Property not found.");

    const problem = transitionError(current.status, data.status);
    if (problem) return { ok: false, status: current.status, error: problem };

    // The guard against a stale client: the status is written only if the row
    // still holds what we just read, so a client acting on an older snapshot
    // cannot win a race against someone who changed it in the meantime.
    if (data.status !== current.status) {
      const { error: updateError } = await context.supabase
        .from("properties")
        .update({ status: data.status })
        .eq("id", data.id)
        .eq("status", current.status);
      if (updateError) throw new Error("The request could not be completed. Please try again.");
    }
    return { ok: true, status: data.status };
  });

const reopenSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().min(5, "Give a reason of at least 5 characters"),
});

/**
 * The one recorded way back for a sold or rented property.
 *
 * Writes an audit row holding the acting admin, the reason and both statuses,
 * then flips the status. The reason is trimmed and is stored only in that
 * table -- it is never logged, and no message content passes through here.
 */
export const reopenProperty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => reopenSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("reopen_property", {
      _property_id: data.id,
      _reason: data.reason.trim(),
    });
    if (error) throw new Error("The request could not be completed. Please try again.");
    return { ok: true };
  });

/**
 * The availability question.
 *
 * Only genuinely available ids come back in `available`; the rest are reported
 * as notAvailable or unknown rather than silently dropped, so a caller asking
 * about a specific property learns it has moved on instead of assuming it.
 */
export const checkAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).max(100) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("properties")
      .select("id, status")
      .in("id", data.ids);
    if (error) throw new Error("The request could not be completed. Please try again.");

    // RLS already scoped this to the caller's agency, so a caller cannot probe
    // another agency's inventory at all.
    const found = new Map((rows ?? []).map((r) => [r.id as string, r.status as string]));

    return {
      available: data.ids.filter((id) => {
        const status = found.get(id);
        return status !== undefined && isAvailableStatus(status);
      }),
      notAvailable: data.ids.filter((id) => {
        const status = found.get(id);
        return status !== undefined && !isAvailableStatus(status);
      }),
      unknown: data.ids.filter((id) => !found.has(id)),
    };
  });

export { isAvailableStatus, transitionError };
