import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPlanLimit } from "@/lib/plan-limits.server";

const agencySchema = z.object({
  agencyName: z.string().min(2),
  city: z.string().optional(),
  phone: z.string().optional(),
  whatsappNumber: z.string().optional(),
  adminName: z.string().min(2),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(8),
});

// The invited role. Deliberately the same two-value union the invitation table
// enforces, so a caller cannot ask for super_admin here either.
const memberSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
  jobTitle: z.string().optional(),
  role: z.enum(["agency_admin", "employee"]),
});

async function assertRole(
  supabase: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown }> },
  userId: string,
  role: "super_admin" | "agency_admin",
) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: role });
  if (data !== true) throw new Error("You do not have permission to do this.");
}

/** Super admin: create an agency plus its first admin account. */
export const provisionAgency = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(agencySchema)
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase as never, context.userId, "super_admin");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: agency, error: agencyError } = await supabaseAdmin
      .from("agencies")
      .insert({
        name: data.agencyName,
        phone: data.phone ?? null,
        whatsapp_number: data.whatsappNumber ?? null,
        cities_served: data.city ? [data.city] : [],
      })
      .select("id")
      .single();
    if (agencyError) throw new Error(agencyError.message);

    const { error: configError } = await supabaseAdmin.from("whatsapp_configs").insert({
      agency_id: agency.id,
      whatsapp_number: data.whatsappNumber ?? null,
    });
    if (configError) throw new Error(configError.message);

    const created = await supabaseAdmin.auth.admin.createUser({
      email: data.adminEmail,
      password: data.adminPassword,
      email_confirm: true,
      user_metadata: { full_name: data.adminName },
    });
    if (created.error || !created.data.user) {
      await supabaseAdmin.from("agencies").delete().eq("id", agency.id);
      throw new Error(created.error?.message ?? "Could not create the admin account.");
    }

    const adminId = created.data.user.id;
    await supabaseAdmin.from("profiles").upsert({
      id: adminId,
      agency_id: agency.id,
      full_name: data.adminName,
      email: data.adminEmail,
      job_title: "Agency Admin",
    });
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: adminId, role: "agency_admin", agency_id: agency.id });
    if (roleError) throw new Error(roleError.message);

    return { agencyId: agency.id };
  });

/**
 * DEPRECATED: kept only so an existing caller does not break at build time.
 * Superseded by inviteTeamMember in lib/invitations.functions.ts, which issues
 * a link instead of letting the admin choose the member's password.
 *
 * This function is no longer registered as a route handler and is not called
 * from any screen. It throws if invoked, rather than silently continuing to
 * create accounts with an admin-supplied password.
 */
export const addTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(memberSchema)
  .handler(async (): Promise<never> => {
    throw new Error("Adding a member with a password is no longer supported. Use Invite instead.");
  });

/** Super admin: pause or reactivate a whole agency. */
export const setAgencyStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ agencyId: z.string().uuid(), status: z.enum(["active", "suspended"]) }))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase as never, context.userId, "super_admin");
    const { error } = await context.supabase
      .from("agencies")
      .update({ status: data.status })
      .eq("id", data.agencyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const memberStatusSchema = z.object({
  profileId: z.string().uuid(),
  status: z.enum(["active", "suspended"]),
});

/**
 * Agency admin (their own agency) or super admin: activate/deactivate a
 * team member. This has to be a trusted server-side path -- migration 0001
 * added a trigger that blocks a plain `profiles` UPDATE from changing
 * `status` unless the caller is a super admin or this is a service-role
 * connection, so a direct client-side update from the team screen would now
 * fail by design. This function does the privilege check itself (never
 * trusts the client) and then writes through supabaseAdmin.
 */
export const setMemberStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(memberStatusSchema)
  .handler(async ({ data, context }) => {
    if (data.profileId === context.userId) {
      throw new Error("You cannot change your own account status here.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: target, error: targetError }, { data: isSuper }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, agency_id").eq("id", data.profileId).maybeSingle(),
      context.supabase.rpc("is_super_admin"),
    ]);
    if (targetError) throw new Error(targetError.message);
    if (!target) throw new Error("Member not found.");

    if (!isSuper) {
      if (!target.agency_id) throw new Error("You do not have permission to do this.");
      await assertRole(context.supabase as never, context.userId, "agency_admin");
      const { data: sameAgency } = await context.supabase.rpc("is_agency_admin", {
        _agency_id: target.agency_id,
      });
      if (!sameAgency) throw new Error("You do not have permission to do this.");
    }

    // A platform owner's account is never touched through the team screen.
    const { data: targetRoles, error: rolesError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.profileId);
    if (rolesError) throw new Error(rolesError.message);
    if (targetRoles?.some((r) => r.role === "super_admin")) {
      throw new Error("A platform owner's status cannot be changed here.");
    }

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ status: data.status })
      .eq("id", data.profileId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
