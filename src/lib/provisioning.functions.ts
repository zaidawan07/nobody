import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { emailConfigured } from "@/lib/invitations.functions";

// Agency creation.
//
// The platform owner never chooses -- or sees -- a password for the person
// running the new agency. provisionAgency issues an invite link instead, the
// same way inviteTeamMember does for a colleague, so there is exactly one way
// an account is created in this product.
//
// assertPlanLimit is absent on purpose, not by omission. plan_limit_for_agency
// reads a subscription row a brand-new agency does not have yet, so it returns
// null (unconstrained) and the call would be a no-op today -- but it is also
// the one call that could make the first admin uncreatable, which would leave
// a tenant nobody can administer. The first admin must always be creatable.
const agencySchema = z.object({
  agencyName: z.string().min(2),
  city: z.string().optional(),
  phone: z.string().optional(),
  whatsappNumber: z.string().optional(),
  adminName: z.string().min(2),
  adminEmail: z.string().email(),
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

    // Nothing exists yet, so a failed admin means the whole tenant goes away
    // again rather than sitting there with no one able to open it.
    const rollback = async () => {
      await supabaseAdmin.from("agencies").delete().eq("id", agency.id);
    };

    // generateLink({ type: "invite" }) creates the user AND returns
    // action_link without sending anything, so the credential is ours to hand
    // over once (verified: @supabase/auth-js GoTrueAdminApi.d.ts:249).
    const invite = await supabaseAdmin.auth.admin.generateLink({
      type: "invite",
      email: data.adminEmail,
      options: { redirectTo: "/accept-invitation" },
    });
    const adminId = invite.data?.user?.id;
    const actionLink = invite.data?.properties?.action_link;
    if (invite.error || !adminId || !actionLink) {
      await rollback();
      throw new Error(invite.error?.message ?? "Could not issue the first admin's invitation.");
    }

    const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
      id: adminId,
      agency_id: agency.id,
      full_name: data.adminName,
      email: data.adminEmail,
      job_title: "Agency Admin",
    });
    if (profileError) {
      await rollback();
      throw new Error(profileError.message);
    }

    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: adminId, role: "agency_admin", agency_id: agency.id });
    if (roleError) {
      await rollback();
      throw new Error(roleError.message);
    }

    // Email only when a transport exists -- the same rule as
    // inviteTeamMember, so we never claim a message was sent that was not.
    // With none configured this is copy-and-share, and the dialog says so.
    let emailSent = false;
    let emailError: string | null = null;
    if (emailConfigured()) {
      const byEmail = await supabaseAdmin.auth.admin.inviteUserByEmail(data.adminEmail, {
        redirectTo: "/accept-invitation",
      });
      if (byEmail.error) emailError = byEmail.error.message;
      else emailSent = true;
    }

    return { agencyId: agency.id, actionLink, emailSent, emailError };
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
