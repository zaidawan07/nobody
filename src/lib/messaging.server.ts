// Server-only (see client.server.ts's note on the *.server.ts convention --
// top-level import of this file is only safe from other .server.ts modules).
//
// Provider: Twilio is retained for optional SMS only. Automated WhatsApp must
// use the agency's Meta-connected sender; the shared Twilio sender is blocked.
//
// SMS requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_SMS_FROM.
// Live sends are also guarded by MESSAGING_LIVE_SEND in the cron route.

import type { Database } from "@/integrations/supabase/types";
import { normalizePhoneE164 } from "@/lib/phone";

type CheckinChannel = Database["public"]["Enums"]["checkin_channel"];

export { buildCheckinMessage } from "@/lib/checkin-message";

export async function sendCheckinMessage(params: {
  to: string;
  channel: CheckinChannel;
  body: string;
}): Promise<{ providerMessageId: string }> {
  if (params.channel === "whatsapp") {
    throw new Error(
      "Automated WhatsApp sending is unavailable until this agency connects its own Meta WhatsApp number.",
    );
  }

  const accountSid = process.env["TWILIO_ACCOUNT_SID"];
  const authToken = process.env["TWILIO_AUTH_TOKEN"];
  const from = process.env["TWILIO_SMS_FROM"];

  if (!accountSid || !authToken || !from) {
    throw new Error(
      `Messaging isn't configured yet: set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and ` +
        "TWILIO_SMS_FROM.",
    );
  }

  const to = normalizePhoneE164(params.to);
  const fromNumber = from.replace(/^whatsapp:/i, "");
  const fromE164 = normalizePhoneE164(fromNumber);
  if (!to || !fromE164) {
    throw new Error("Messaging requires valid E.164 sender and recipient numbers.");
  }

  const body = new URLSearchParams({
    To: to,
    From: fromE164,
    Body: params.body,
  });

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      },
      body,
    },
  );

  const json = (await res.json()) as { sid?: string; message?: string };
  if (!res.ok) {
    throw new Error(`SMS provider request failed (status ${res.status}).`);
  }
  return { providerMessageId: json.sid ?? "" };
}
