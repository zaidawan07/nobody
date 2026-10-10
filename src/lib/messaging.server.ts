// Server-only (see client.server.ts's note on the *.server.ts convention --
// top-level import of this file is only safe from other .server.ts modules).
//
// Provider: Twilio, chosen because one REST API covers both SMS and
// WhatsApp (just a different `From`/`To` prefix) and needs no SDK -- a
// plain fetch with Basic Auth. This is the ONE place a different provider
// (Meta's WhatsApp Cloud API, Gupshup, 360dialog) would get swapped in.
//
// Needs three env vars to actually send: TWILIO_ACCOUNT_SID,
// TWILIO_AUTH_TOKEN, and either TWILIO_SMS_FROM or TWILIO_WHATSAPP_FROM
// depending on channel. Without them this throws instead of pretending to
// succeed -- a check-in stays "scheduled"/"failed" rather than silently
// becoming "sent" when nothing was actually delivered.

import type { Database } from "@/integrations/supabase/types";

type CheckinContactType = Database["public"]["Enums"]["checkin_contact_type"];
type CheckinChannel = Database["public"]["Enums"]["checkin_channel"];

export function buildCheckinMessage(params: {
  propertyTitle: string;
  contactType: CheckinContactType;
  agencyName: string;
}): string {
  const who = params.contactType === "owner" ? "the owner" : params.contactType === "tenant" ? "the tenant" : "you";
  return (
    `Hi, this is ${params.agencyName}. Quick check-in on "${params.propertyTitle}": ` +
    `how has it been -- comfortable, and in good condition? ` +
    `Also, is the property currently empty? If so, reply EMPTY and we'll reach out about next steps. ` +
    `${who === "you" ? "Thanks for the referral -- any new" : "If you know anyone looking, send them"} our way!`
  );
}

export async function sendCheckinMessage(params: {
  to: string;
  channel: CheckinChannel;
  body: string;
}): Promise<{ providerMessageId: string }> {
  const accountSid = process.env["TWILIO_ACCOUNT_SID"];
  const authToken = process.env["TWILIO_AUTH_TOKEN"];
  const from =
    params.channel === "whatsapp"
      ? process.env["TWILIO_WHATSAPP_FROM"]
      : process.env["TWILIO_SMS_FROM"];

  if (!accountSid || !authToken || !from) {
    throw new Error(
      `Messaging isn't configured yet: set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and ` +
        `${params.channel === "whatsapp" ? "TWILIO_WHATSAPP_FROM" : "TWILIO_SMS_FROM"}.`,
    );
  }

  const prefix = params.channel === "whatsapp" ? "whatsapp:" : "";
  const body = new URLSearchParams({
    To: `${prefix}${params.to}`,
    From: from.startsWith("whatsapp:") ? from : `${prefix}${from}`,
    Body: params.body,
  });

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
    },
    body,
  });

  const json = (await res.json()) as { sid?: string; message?: string };
  if (!res.ok) {
    throw new Error(json.message ?? `Twilio request failed (${res.status})`);
  }
  return { providerMessageId: json.sid ?? "" };
}
