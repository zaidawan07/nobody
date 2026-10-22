import type { Database } from "@/integrations/supabase/types";

type ContactType = Database["public"]["Enums"]["checkin_contact_type"];

export function buildCheckinMessage(params: {
  propertyTitle: string;
  contactType: ContactType;
  agencyName: string;
}): string {
  const base =
    `Assalam-o-alaikum, this is ${params.agencyName}. Quick check-in about "${params.propertyTitle}": ` +
    "how is the property, and is it currently vacant? Reply with an update when convenient.";
  const closing =
    params.contactType === "realtor"
      ? "Thanks for your support."
      : "If anything needs attention, please let us know.";
  return `${base} ${closing} Reply STOP if you no longer want these follow-ups.`;
}
