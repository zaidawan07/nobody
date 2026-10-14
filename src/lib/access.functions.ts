import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { constantTimeSecretMatch, resolvePrimaryRole } from "@/lib/security";
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

    const [{ data: profile, error: profileError }, { data: roles, error: rolesError }] = await Promise.all([
      supabase
        .from("profiles")
        .select("full_name, email, agency_id, agencies(name)")
        .eq("id", userId)
        .maybeSingle(),
      supabase.from("user_roles").select("role, agency_id").eq("user_id", userId),
    ]);
    if (profileError) throw new Error("Unable to load your account profile.");
    if (rolesError) throw new Error("Unable to verify your access role.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count, error: countError } = await supabaseAdmin
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("role", "super_admin");
    if (countError) throw new Error("Unable to verify platform setup status.");

    const role = resolvePrimaryRole(roles ?? []);
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
  .inputValidator((input: unknown) => z.object({ bootstrapSecret: z.string().min(1).max(512) }).parse(input))
  .handler(async ({ data, context }) => {
    const expectedSecret = process.env["PLATFORM_BOOTSTRAP_SECRET"];
    if (!expectedSecret) {
      throw new Error("Platform bootstrap is disabled until PLATFORM_BOOTSTRAP_SECRET is configured.");
    }
    if (!(await constantTimeSecretMatch(data.bootstrapSecret, expectedSecret))) {
      throw new Error("Invalid platform bootstrap secret.");
    }

    const { data: profile, error: profileError } = await context.supabase
      .from("profiles")
      .select("agency_id")
      .eq("id", context.userId)
      .maybeSingle();
    if (profileError || !profile || profile.agency_id) {
      throw new Error("Only an unassigned platform account can claim the first-owner seat.");
    }
    const { data: existingRoles, error: existingRolesError } = await context.supabase
      .from("user_roles")
      .select("id")
      .eq("user_id", context.userId)
      .limit(1);
    if (existingRolesError) throw new Error("Unable to verify your current roles.");
    if ((existingRoles ?? []).length > 0) {
      throw new Error("An account with an existing role cannot claim platform ownership.");
    }

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
    if (error) {
      // The database's partial unique index is the final concurrency guard:
      // two first-time claims can race past the count check, but only one insert
      // can succeed. Translate that expected race into a safe, actionable error.
      if (error.code === "23505") {
        throw new Error("A platform owner was claimed by another account. Only one platform owner is allowed.");
      }
      throw new Error(error.message);
    }
    return { ok: true };
  });
