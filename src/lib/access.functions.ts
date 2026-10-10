import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AppRole = "super_admin" | "agency_admin" | "employee";

export interface MyAccess {
  userId: string;
  email: string | null;
  fullName: string | null;
  role: AppRole | null;
  agencyId: string | null;
  agencyName: string | null;
  platformHasSuperAdmin: boolean;
}

export const getMyAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyAccess> => {
    const { supabase, userId } = context;

    const [{ data: profile }, { data: roles }] = await Promise.all([
      supabase
        .from("profiles")
        .select("full_name, email, agency_id, agencies(name)")
        .eq("id", userId)
        .maybeSingle(),
      supabase.from("user_roles").select("role, agency_id").eq("user_id", userId),
    ]);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("role", "super_admin");

    const role = (roles?.[0]?.role as AppRole | undefined) ?? null;
    const agency = profile?.agencies as { name?: string } | null;

    return {
      userId,
      email: profile?.email ?? null,
      fullName: profile?.full_name ?? null,
      role,
      agencyId: profile?.agency_id ?? null,
      agencyName: agency?.name ?? null,
      platformHasSuperAdmin: (count ?? 0) > 0,
    };
  });

/**
 * Bootstrap: the very first account on a fresh platform can claim the
 * super admin seat. Once one exists, this is permanently closed.
 *
 * Race-safety: `platform_bootstrap` (migration 0001) has a boolean primary
 * key, so it can hold exactly one row, ever. That INSERT is the atomic gate
 * -- Postgres itself rejects a second concurrent claim with a
 * unique_violation, so two requests racing each other can never both pass.
 * The previous version of this function did a count() on user_roles and
 * then a separate insert(), which left a window where both requests could
 * read "no super admin yet" before either write committed.
 */
export const claimSuperAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error: claimError } = await supabaseAdmin
      .from("platform_bootstrap")
      .insert({ claimed_by: context.userId });
    if (claimError) {
      if (claimError.code === "23505") throw new Error("A platform owner already exists.");
      throw new Error(claimError.message);
    }

    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: context.userId, role: "super_admin" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
