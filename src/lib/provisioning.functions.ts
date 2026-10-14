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
      .select("agency_id")
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
      .select("agency_id,status")
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


const agencySettingsSchema = z.object({
  name: z.string().trim().min(2).max(150),
  phone: z.string().trim().max(40),
  email: z.union([z.string().trim().email().max(254), z.literal("")]),
  officeAddress: z.string().trim().max(300),
  citiesServed: z.array(z.string().trim().min(1).max(100)).max(20),
  description: z.string().trim().max(2000),
  workingHours: z.string().trim().max(500),
});

/** Agency admin: update only the profile of the agency assigned to the current account. */
export const updateAgencySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => agencySettingsSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase as never, context.userId, "agency_admin");

    const { data: actor, error: actorError } = await context.supabase
      .from("profiles")
      .select("agency_id,status")
      .eq("id", context.userId)
      .maybeSingle();
    if (actorError || !actor?.agency_id || actor.status !== "active") {
      throw new Error("Your account is not an active agency administrator.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: updated, error } = await supabaseAdmin
      .from("agencies")
      .update({
        name: data.name,
        phone: data.phone || null,
        email: data.email || null,
        office_address: data.officeAddress || null,
        cities_served: [...new Set(data.citiesServed.map((city) => city.trim()).filter(Boolean))],
        description: data.description || null,
        working_hours: data.workingHours || null,
      })
      .eq("id", actor.agency_id)
      .eq("status", "active")
      .select("id")
      .maybeSingle();
    if (error || !updated) throw new Error("Could not update agency settings. Verify that the agency is active.");
    return { ok: true };
  });


const subscriptionPlanSchema = z.object({
  planId: z.string().uuid(),
  monthlyPricePkr: z.number().min(0).nullable(),
  annualPricePkr: z.number().min(0).nullable(),
  maxProperties: z.number().int().min(0).nullable(),
  maxLeads: z.number().int().min(0).nullable(),
  maxTeamMembers: z.number().int().min(1).nullable(),
  maxAiRepliesPerDay: z.number().int().min(0),
  isActive: z.boolean(),
});

/** Platform owner: configure a plan's price and usage limits. */
export const updateSubscriptionPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => subscriptionPlanSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase as never, context.userId, "super_admin");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing, error: lookupError } = await supabaseAdmin
      .from("subscription_plans").select("id,code").eq("id", data.planId).maybeSingle();
    if (lookupError || !existing) throw new Error("Subscription plan was not found.");
    if (existing.code === "starter" && !data.isActive) {
      throw new Error("The Starter plan must remain active as the default for new agencies.");
    }
    const { error } = await supabaseAdmin.from("subscription_plans").update({
      monthly_price_pkr: data.monthlyPricePkr,
      annual_price_pkr: data.annualPricePkr,
      max_properties: data.maxProperties,
      max_leads: data.maxLeads,
      max_team_members: data.maxTeamMembers,
      max_ai_replies_per_day: data.maxAiRepliesPerDay,
      is_active: data.isActive,
    }).eq("id", data.planId);
    if (error) throw new Error("Could not update subscription plan settings.");
    return { ok: true };
  });

/** Platform owner: resolve a plan request atomically in the database. */
export const resolveSubscriptionRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    requestId: z.string().uuid(),
    decision: z.enum(["approved", "rejected"]),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase as never, context.userId, "super_admin");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("resolve_subscription_change_request", {
      _request_id: data.requestId,
      _decision: data.decision,
      _actor_id: context.userId,
    });
    if (error) throw new Error(error.message.includes("already resolved") ? "This request has already been resolved." : "Could not resolve the subscription request.");
    return { ok: true };
  });
