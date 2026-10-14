import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const agencySchema = z.object({
  agencyName: z.string().min(2),
  city: z.string().optional(),
  phone: z.string().optional(),
  whatsappNumber: z.string().optional(),
  adminName: z.string().min(2),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(8),
});

const memberSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
  jobTitle: z.string().optional(),
  password: z.string().min(8),
  role: z.enum(["agency_admin", "employee"]),
});

async function assertRole(
  supabase: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error?: { message: string } | null }> },
  userId: string,
  role: "super_admin" | "agency_admin",
) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: role });
  if (error || data !== true) throw new Error("You do not have permission to do this.");
}

/** Super admin: create an agency plus its first admin account. */
export const provisionAgency = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => agencySchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase as never, context.userId, "super_admin");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: agency, error: agencyError } = await supabaseAdmin
      .from("agencies")
      .insert({
        name: data.agencyName.trim(),
        phone: data.phone?.trim() || null,
        whatsapp_number: data.whatsappNumber?.trim() || null,
        cities_served: data.city?.trim() ? [data.city.trim()] : [],
      })
      .select("id")
      .single();
    if (agencyError || !agency) throw new Error(agencyError?.message ?? "Could not create the agency.");

    let adminId: string | null = null;
    try {
      const { error: configError } = await supabaseAdmin.from("whatsapp_configs").insert({
        agency_id: agency.id,
        whatsapp_number: data.whatsappNumber?.trim() || null,
      });
      if (configError) throw new Error(configError.message);

      const created = await supabaseAdmin.auth.admin.createUser({
        email: data.adminEmail.trim().toLowerCase(),
        password: data.adminPassword,
        email_confirm: true,
        user_metadata: { full_name: data.adminName.trim() },
      });
      if (created.error || !created.data.user) {
        throw new Error(created.error?.message ?? "Could not create the admin account.");
      }
      adminId = created.data.user.id;

      const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
        id: adminId,
        agency_id: agency.id,
        full_name: data.adminName.trim(),
        email: data.adminEmail.trim().toLowerCase(),
        job_title: "Agency Admin",
      });
      if (profileError) throw new Error(profileError.message);

      const { error: roleError } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: adminId, role: "agency_admin", agency_id: agency.id });
      if (roleError) throw new Error(roleError.message);

      return { agencyId: agency.id };
    } catch (error) {
      // Supabase REST calls are not one SQL transaction; compensate on partial failure.
      if (adminId) {
        await supabaseAdmin.from("user_roles").delete().eq("user_id", adminId);
        await supabaseAdmin.from("profiles").delete().eq("id", adminId);
        await supabaseAdmin.auth.admin.deleteUser(adminId);
      }
      await supabaseAdmin.from("agencies").delete().eq("id", agency.id);
      throw error;
    }
  });

/** Agency admin: add a teammate inside their own agency only. */
export const addTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => memberSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase as never, context.userId, "agency_admin");

    const { data: me, error: meError } = await context.supabase
      .from("profiles")
      .select("agency_id,status")
      .eq("id", context.userId)
      .maybeSingle();
    if (meError) throw new Error(meError.message);
    if (!me?.agency_id) throw new Error("Your account is not linked to an agency.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const created = await supabaseAdmin.auth.admin.createUser({
      email: data.email.trim().toLowerCase(),
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName.trim() },
    });
    if (created.error || !created.data.user) {
      throw new Error(created.error?.message ?? "Could not create the account.");
    }

    const memberId = created.data.user.id;
    try {
      const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
        id: memberId,
        agency_id: me.agency_id,
        full_name: data.fullName.trim(),
        email: data.email.trim().toLowerCase(),
        phone: data.phone?.trim() || null,
        job_title: data.jobTitle?.trim() || null,
      });
      if (profileError) throw new Error(profileError.message);

      const { error: roleError } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: memberId, role: data.role, agency_id: me.agency_id });
      if (roleError) throw new Error(roleError.message);

      return { userId: memberId };
    } catch (error) {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", memberId);
      await supabaseAdmin.from("profiles").delete().eq("id", memberId);
      await supabaseAdmin.auth.admin.deleteUser(memberId);
      throw error;
    }
  });

/** Super admin: pause or reactivate a whole agency. */
export const setAgencyStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ agencyId: z.string().uuid(), status: z.enum(["active", "suspended"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase as never, context.userId, "super_admin");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("agencies")
      .update({ status: data.status })
      .eq("id", data.agencyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


/** Agency admin: suspend/reactivate a teammate without changing their assigned role. */
export const setTeamMemberStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid(), status: z.enum(["active", "suspended"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase as never, context.userId, "agency_admin");
    if (data.userId === context.userId) {
      throw new Error("You cannot suspend your own account from the team screen.");
    }

    const { data: actor, error: actorError } = await context.supabase
      .from("profiles")
      .select("agency_id")
      .eq("id", context.userId)
      .maybeSingle();
    if (actorError || !actor?.agency_id) {
      throw new Error("Your account is not linked to an agency.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: target, error: targetError } = await supabaseAdmin
      .from("profiles")
      .select("id,agency_id,status")
      .eq("id", data.userId)
      .maybeSingle();
    if (targetError || !target || target.agency_id !== actor.agency_id) {
      throw new Error("That teammate does not belong to your agency.");
    }

    if (data.status === "suspended") {
      const { data: roleRows, error: rolesError } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .eq("agency_id", actor.agency_id)
        .eq("role", "agency_admin");
      if (rolesError) throw new Error("Unable to verify agency administrator coverage.");
      const otherAdminIds = (roleRows ?? [])
        .map((row) => row.user_id)
        .filter((id) => id !== data.userId && id !== context.userId);
      const { data: activeAdmins, error: activeAdminsError } = otherAdminIds.length
        ? await supabaseAdmin.from("profiles").select("id").in("id", otherAdminIds).eq("agency_id", actor.agency_id).eq("status", "active")
        : { data: [], error: null };
      if (activeAdminsError) throw new Error("Unable to verify agency administrator coverage.");
      const targetIsAdmin = (roleRows ?? []).some((row) => row.user_id === data.userId);
      const otherActiveAdminExists = (activeAdmins ?? []).length > 0 || actor.status === "active";
      if (targetIsAdmin && !otherActiveAdminExists) {
        throw new Error("Keep at least one other active agency administrator before suspending this account.");
      }
    }

    const { error: updateError } = await supabaseAdmin
      .from("profiles")
      .update({ status: data.status })
      .eq("id", data.userId)
      .eq("agency_id", actor.agency_id);
    if (updateError) throw new Error("Could not update teammate status.");
    return { ok: true };
  });
