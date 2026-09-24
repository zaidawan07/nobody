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
 */
export const claimSuperAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count, error: countError } = await supabaseAdmin
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("role", "super_admin");
    if (countError) throw new Error(countError.message);
    if ((count ?? 0) > 0) throw new Error("A platform owner already exists.");

    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: context.userId, role: "super_admin" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
