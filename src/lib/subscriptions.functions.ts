import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

// Manual subscription management for the Super Admin.
//
// There is deliberately NO payment provider wired up: nothing here charges a
// card, and nothing calls a billing API. These are the only two ways a
// subscription row can change, both restricted to super admins in the handler
// and again by migration 0006's RLS policy, because the write goes through the
// caller's own connection rather than service_role.

async function assertSuperAdmin(
  supabase: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown }> },
  userId: string,
) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "super_admin" });
  if (data !== true) throw new Error("You do not have permission to do this.");
}

const assignSchema = z.object({
  agencyId: z.string().uuid(),
  planId: z.string().uuid(),
  /** When set, start a trial of exactly this many days from now. */
  trialDays: z.number().min(0).max(3650).optional(),
});

/** Assign or change one agency's plan (creates the subscription if none exists). */
export const assignAgencyPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => assignSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase as never, context.userId);

    // upsert() needs an insert-shaped row (agency_id/plan_id required); update()
    // below needs the update shape. Typing the two separately keeps
    // exactOptionalPropertyTypes happy.
    const patch: TablesInsert<"subscriptions"> = {
      agency_id: data.agencyId,
      plan_id: data.planId,
      // Reassigning an expired/past-due agency should bring them back live.
      status: "active",
      current_period_start: new Date().toISOString(),
      canceled_at: null,
      cancel_reason: null,
    };
    if (data.trialDays && data.trialDays > 0) {
      const ends = new Date(Date.now() + data.trialDays * 24 * 60 * 60 * 1000);
      patch.status = "trialing";
      patch.trial_ends_at = ends.toISOString();
    }

    const { error } = await context.supabase
      .from("subscriptions")
      .upsert(patch, { onConflict: "agency_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const statusSchema = z.object({
  agencyId: z.string().uuid(),
  status: z.enum(["trialing", "active", "past_due", "canceled", "expired"]),
});

/** Manually set an agency's subscription status (e.g. suspend for non-payment). */
export const setSubscriptionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => statusSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase as never, context.userId);

    const patch: TablesUpdate<"subscriptions"> = { status: data.status };
    if (data.status === "canceled") {
      patch.canceled_at = new Date().toISOString();
      patch.canceled_by = context.userId;
    }
    if (data.status === "trialing" || data.status === "active") {
      patch.canceled_at = null;
      patch.canceled_by = null;
    }

    const { error } = await context.supabase
      .from("subscriptions")
      .update(patch)
      .eq("agency_id", data.agencyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
