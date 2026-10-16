import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPlanLimit } from "@/lib/plan-limits.server";

// Team-member invitations.
//
// The previous flow had the agency admin choose the new member's password, so
// the admin held a credential they did not own. Now the admin issues an invite
// and never sees a password:
//
//   * `generateLink({ type: "invite" })` RETURNS an action_link without sending
//     an email, so the link is ours to deliver however the admin likes.
//     Verified against the installed typings:
//     node_modules/@supabase/auth-js/dist/main/GoTrueAdminApi.d.ts:249
//   * Email is only used when a mail transport is configured. With none, the
//     invite is copy-paste only -- and we say so rather than pretend it sent.
//
// Every function checks the caller is an agency_admin of their OWN agency.
// RLS independently refuses cross-agency reads and writes, so this is the
// second layer, not the only one.

// How long OUR agency_invitations row stays pending before we call it expired.
// This is bookkeeping for the pending list only -- it is NOT how long the invite
// LINK lives. The link's real lifetime is Supabase's project setting
// "Email OTP expiration" (Supabase docs: default 1 hour / 3600s; >86400s is
// strongly discouraged), which governs invitation links alongside magic links,
// confirmation and recovery links. Keeping this at 7 days is deliberate: it must
// be >= the link TTL so a pending row is never revived after the link died.
const INVITE_TTL_DAYS = 7;

// One place to state the link lifetime for UI copy, so no screen invents its own
// number. "Supabase default" is honest -- we cannot read the project setting from
// here, and the app must not imply it can.
export const INVITE_LINK_LIFETIME_LABEL =
  "1 hour by default (Supabase project setting: Email OTP expiration)";

// Env names that mean "a mail transport exists". Names only, never values.
// Exported because provisionAgency runs the identical "did we actually send?"
// check for a brand-new agency's first admin; keeping one definition means a
// change to the transport env names cannot split the two flows apart.
export const emailConfigured = () =>
  Boolean(process.env["SMTP_HOST"] || process.env["RESEND_API_KEY"]);

const inviteSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(1).max(120),
  phone: z.string().trim().max(40).optional(),
  jobTitle: z.string().trim().max(120).optional(),
  // Only these two values are expressible. "super_admin" is not in the union,
  // so no caller can ask for it -- the same guard the DB enum enforces.
  role: z.enum(["agency_admin", "employee"]),
});

const idSchema = z.object({ invitationId: z.string().uuid() });

type RoleRow = { role: string; agency_id: string | null };

/** The caller's own agency_admin row, or a thrown user-facing error. */
async function requireAgencyAdmin(userId: string): Promise<string> {
  // Imported here, not at the top: client.server.ts is server-only and must
  // never be reachable from a module the browser can load.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role, agency_id")
    .eq("user_id", userId)
    .eq("role", "agency_admin");
  if (error) throw new Error(error.message);
  const row = (data as RoleRow[] | null)?.[0];
  if (!row?.agency_id) {
    throw new Error("Only an agency admin can manage invitations.");
  }
  return row.agency_id;
}

/** Reads one invite through the service-role client and checks the agency. */
async function loadOwnedInvite(invitationId: string, agencyId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("agency_invitations")
    .select("id, agency_id, email, status")
    .eq("id", invitationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Invitation not found.");
  if (data.agency_id !== agencyId) {
    throw new Error("You do not have permission to do this.");
  }
  return data;
}

export const inviteTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inviteSchema)
  .handler(async ({ data, context }) => {
    const agencyId = await requireAgencyAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // The 0008 plan trigger deliberately skips service_role, so the cap is
    // checked here -- the same reason addTeamMember always did.
    await assertPlanLimit(supabaseAdmin as never, agencyId, "team_members");

    // Refuse a duplicate live invite before touching the auth API, so the
    // error is ours and not a raw unique violation.
    const { data: existing } = await supabaseAdmin
      .from("agency_invitations")
      .select("id")
      .eq("agency_id", agencyId)
      .eq("email", data.email)
      .eq("status", "pending")
      .maybeSingle();
    if (existing) {
      throw new Error(
        "There is already a pending invitation for that email. Revoke it before sending a new one.",
      );
    }

    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const invite = await supabaseAdmin.auth.admin.generateLink({
      type: "invite",
      email: data.email,
      options: { redirectTo: "/accept-invitation" },
    });
    if (invite.error || !invite.data) {
      throw new Error(invite.error?.message ?? "Could not create the invitation.");
    }

    const inviteeId = invite.data.user?.id;
    const actionLink = invite.data.properties?.action_link;
    if (!inviteeId || !actionLink) {
      throw new Error("The invitation link could not be generated.");
    }

    // profile + role + invite row go through the service-role client, because
    // 0001's trigger blocks agency_id/status writes from a normal session.
    const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
      id: inviteeId,
      agency_id: agencyId,
      full_name: data.fullName,
      email: data.email,
      phone: data.phone ?? null,
      job_title: data.jobTitle ?? null,
    });
    if (profileError) throw new Error(profileError.message);

    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: inviteeId, role: data.role, agency_id: agencyId });
    if (roleError) throw new Error(roleError.message);

    const { error: inviteError } = await supabaseAdmin.from("agency_invitations").insert({
      agency_id: agencyId,
      email: data.email,
      full_name: data.fullName,
      phone: data.phone ?? null,
      job_title: data.jobTitle ?? null,
      role: data.role,
      invited_by: context.userId,
      expires_at: expiresAt,
      last_sent_at: new Date().toISOString(),
      send_count: 1,
    });
    if (inviteError) throw new Error(inviteError.message);

    // Email only when a transport exists. inviteUserByEmail would send nothing
    // useful without SMTP, so we only claim it was sent when it was.
    let emailSent = false;
    if (emailConfigured()) {
      const byEmail = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
        redirectTo: "/accept-invitation",
      });
      if (byEmail.error) {
        // The link already works; a mail failure is reported, not swallowed.
        return {
          actionLink,
          expiresAt,
          emailSent: false,
          emailError: byEmail.error.message,
          role: data.role,
        };
      }
      emailSent = true;
    }

    return { actionLink, expiresAt, emailSent, emailError: null as string | null, role: data.role };
  });

/** Re-issues the link for an existing pending invite. */
export const resendInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(idSchema)
  .handler(async ({ data, context }) => {
    const agencyId = await requireAgencyAdmin(context.userId);
    const invite = await loadOwnedInvite(data.invitationId, agencyId);

    if (invite.status !== "pending") {
      throw new Error("Only a pending invitation can be resent.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const fresh = await supabaseAdmin.auth.admin.generateLink({
      type: "invite",
      email: invite.email,
      options: { redirectTo: "/accept-invitation" },
    });
    if (fresh.error || !fresh.data) {
      throw new Error(fresh.error?.message ?? "Could not create the invitation link.");
    }

    // send_count is our own counter; the DB has no default increment, so the
    // new value is computed here rather than assumed.
    const { data: current } = await supabaseAdmin
      .from("agency_invitations")
      .select("send_count, expires_at")
      .eq("id", invite.id)
      .single();
    const nextCount = (current?.send_count ?? 1) + 1;
    const { error } = await supabaseAdmin
      .from("agency_invitations")
      .update({
        last_sent_at: new Date().toISOString(),
        send_count: nextCount,
      })
      .eq("id", invite.id);
    if (error) throw new Error(error.message);

    return {
      actionLink: fresh.data.properties.action_link,
      expiresAt: current?.expires_at ?? null,
      emailSent: emailConfigured(),
      emailError: null as string | null,
    };
  });

/** Revokes a pending invite. Terminal: the trigger refuses any revival. */
export const revokeInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(idSchema)
  .handler(async ({ data, context }) => {
    const agencyId = await requireAgencyAdmin(context.userId);
    const invite = await loadOwnedInvite(data.invitationId, agencyId);

    if (invite.status !== "pending") {
      throw new Error("That invitation is no longer pending.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("agency_invitations")
      .update({ status: "revoked", revoked_by: context.userId })
      .eq("id", invite.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** The caller's agency's invitations. Read is admin-only in RLS. */
export const listInvitations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("agency_invitations")
      .select(
        "id, email, full_name, role, status, expires_at, accepted_at, last_sent_at, send_count, created_at",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { items: data ?? [] };
  });
