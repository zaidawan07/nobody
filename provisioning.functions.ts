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
  .inputValidator((input: unknown) => agencySchema.parse(input))
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
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName },
    });
    if (created.error || !created.data.user) {
      throw new Error(created.error?.message ?? "Could not create the account.");
    }

    const memberId = created.data.user.id;
    await supabaseAdmin.from("profiles").upsert({
      id: memberId,
      agency_id: me.agency_id,
      full_name: data.fullName,
      email: data.email,
      phone: data.phone ?? null,
      job_title: data.jobTitle ?? null,
    });
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: memberId, role: data.role, agency_id: me.agency_id });
    if (roleError) throw new Error(roleError.message);

    return { userId: memberId };
  });

/** Super admin: pause or reactivate a whole agency. */
export const setAgencyStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ agencyId: z.string().uuid(), status: z.enum(["active", "suspended"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase as never, context.userId, "super_admin");
    const { error } = await context.supabase
      .from("agencies")
      .update({ status: data.status })
      .eq("id", data.agencyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
