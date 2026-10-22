import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizePhoneE164 } from "@/lib/phone";

const scheduleSchema = z.object({
  propertyId: z.string().uuid(),
  contactType: z.enum(["owner", "tenant", "realtor"]),
  contactPhone: z.string().min(1).max(40),
  channel: z.enum(["whatsapp", "sms"]),
  scheduledFor: z.string().datetime(),
  consentConfirmed: z
    .boolean()
    .refine(
      (confirmed) => confirmed,
      "Record the contact's permission before scheduling a follow-up.",
    ),
});

export const schedulePropertyCheckin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(scheduleSchema)
  .handler(async ({ data, context }) => {
    const normalizedPhone = normalizePhoneE164(data.contactPhone);
    if (!normalizedPhone) throw new Error("Enter a valid international phone number.");

    const scheduledAt = new Date(data.scheduledFor);
    if (!Number.isFinite(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) {
      throw new Error("Choose a time in the future.");
    }

    const phoneColumn = (
      {
        owner: "owner_phone",
        tenant: "tenant_phone",
        realtor: "realtor_phone",
      } as const
    )[data.contactType];
    const nameColumn = (
      {
        owner: "owner_name",
        tenant: "tenant_name",
        realtor: "realtor_name",
      } as const
    )[data.contactType];

    const { data: property, error: propertyError } = await context.supabase
      .from("properties")
      .select(
        "id, agency_id, assigned_to, owner_phone, owner_name, tenant_phone, tenant_name, realtor_phone, realtor_name, title",
      )
      .eq("id", data.propertyId)
      .maybeSingle();

    if (propertyError) throw new Error("The request could not be completed. Please try again.");
    if (!property) throw new Error("Property not found or you do not have access to it.");

    const propertyPhone = property[phoneColumn];
    if (!propertyPhone || normalizePhoneE164(propertyPhone) !== normalizedPhone) {
      throw new Error("The selected phone number no longer matches this property's contact.");
    }

    const { error: insertError } = await context.supabase.from("property_checkins").insert({
      agency_id: property.agency_id,
      assigned_to: property.assigned_to,
      property_id: property.id,
      contact_type: data.contactType,
      contact_name: property[nameColumn],
      contact_phone: normalizedPhone,
      channel: data.channel,
      scheduled_for: scheduledAt.toISOString(),
      created_by: context.userId,
      consent_at: new Date().toISOString(),
      consent_recorded_by: context.userId,
      consent_source: "agent_attestation",
    });

    if (insertError) throw new Error("The request could not be completed. Please try again.");
    return { ok: true };
  });

const prepareSchema = z.object({ id: z.string().uuid() });

export const markCheckinPrepared = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(prepareSchema)
  .handler(async ({ data, context }) => {
    const { data: checkin, error } = await context.supabase
      .from("property_checkins")
      .select("id, channel, status, consent_at, scheduled_for, prepared_at")
      .eq("id", data.id)
      .maybeSingle();

    if (error) throw new Error("The request could not be completed. Please try again.");
    if (!checkin) throw new Error("Follow-up not found or you do not have access to it.");
    if (checkin.channel !== "whatsapp")
      throw new Error("Only WhatsApp follow-ups can be prepared this way.");
    if (checkin.status !== "scheduled" || checkin.prepared_at) {
      throw new Error("This follow-up is no longer waiting to be prepared.");
    }
    if (!checkin.consent_at) throw new Error("Record permission before preparing this follow-up.");
    if (new Date(checkin.scheduled_for).getTime() > Date.now()) {
      throw new Error("This follow-up is not due yet.");
    }

    const { error: updateError } = await context.supabase
      .from("property_checkins")
      .update({ prepared_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("status", "scheduled")
      .is("prepared_at", null);

    if (updateError) throw new Error("The request could not be completed. Please try again.");
    return { ok: true, preparedBy: context.userId };
  });
