import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Shared with the Plans form so the client and the server validate the same
// shape. The route file imports these instead of redeclaring them.
export const planSchema = z.object({
  name: z.string().min(2, "Enter a plan name"),
  description: z.string().optional(),
  price_pkr: z.number().min(0, "Price must be positive"),
  interval: z.enum(["monthly", "yearly"]),
  trial_days: z.number().min(0).max(365),
  is_active: z.boolean(),
  sort_order: z.number().min(0),
});

export const planFeatureSchema = z.object({
  plan_id: z.string().uuid(),
  id: z.string().uuid().optional(),
  feature_key: z.string().min(1, "Feature key is required"),
  feature_value: z.string().optional(),
  included: z.boolean(),
  limit_value: z.number().nullable().optional(),
});

/**
 * Every write below runs as the calling super admin's own PostgREST
 * connection (`context.supabase`), never as service_role, so migration 0006's
 * RLS policies are enforced a second time at the database: the role assertion
 * here and the "super admin manages ..." policy in SQL both have to pass.
 * The role check is mandatory regardless -- route guards only protect the UI.
 */
async function assertSuperAdmin(
  supabase: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown }> },
  userId: string,
) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "super_admin" });
  if (data !== true) throw new Error("You do not have permission to do this.");
}

export const createPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => planSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase as never, context.userId);
    const { data: plan, error } = await context.supabase
      .from("plans")
      .insert({
        name: data.name,
        description: data.description ?? null,
        price_pkr: data.price_pkr,
        interval: data.interval,
        trial_days: data.trial_days,
        is_active: data.is_active,
        sort_order: data.sort_order,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { planId: plan.id };
  });

export const updatePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => planSchema.extend({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase as never, context.userId);
    const { id, ...updates } = data;
    const { error } = await context.supabase
      .from("plans")
      .update({ ...updates, description: updates.description ?? null })
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase as never, context.userId);
    const { error } = await context.supabase.from("plans").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const upsertPlanFeature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => planFeatureSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase as never, context.userId);
    const { id, plan_id, feature_value, limit_value, ...rest } = data;
    const row = { ...rest, feature_value: feature_value ?? null, limit_value: limit_value ?? null };
    const { error } = id
      ? await context.supabase.from("plan_features").update(row).eq("id", id)
      : await context.supabase.from("plan_features").insert({ plan_id, ...row });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePlanFeature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase as never, context.userId);
    const { error } = await context.supabase.from("plan_features").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reorderPlans = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ orderedIds: z.array(z.string().uuid()) }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase as never, context.userId);
    for (const [i, id] of data.orderedIds.entries()) {
      const { error } = await context.supabase.from("plans").update({ sort_order: i }).eq("id", id);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
