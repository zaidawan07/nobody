// Lovable Cloud calls this on a schedule; authenticateCronRequest() rejects
// anything without the cron secret, so this is never reachable by a regular
// client. Processes every property_checkins row that's due, sends it via
// Twilio (see lib/messaging.server.ts), and records the outcome.
//
// NOTE: the `server.handlers` shape below is TanStack Start 1.168's
// documented API-route convention. This repo has no prior API route to
// pattern-match against and no node_modules in this sandbox to confirm
// against -- worth a quick check against the installed
// @tanstack/react-start types after `bun install`.
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { buildCheckinMessage, sendCheckinMessage } from "@/lib/messaging.server";

export const Route = createFileRoute("/api/cron/property-checkins")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authError = await authenticateCronRequest(request);
        if (authError) return authError;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: due, error } = await supabaseAdmin
          .from("property_checkins")
          .select("id, contact_phone, channel, contact_type, property_id")
          .eq("status", "scheduled")
          .lte("scheduled_for", new Date().toISOString())
          .limit(50);

        if (error) {
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }
        if (!due || due.length === 0) {
          return Response.json({ ok: true, processed: 0 });
        }

        const propertyIds = Array.from(new Set(due.map((d) => d.property_id)));
        const { data: properties } = await supabaseAdmin
          .from("properties")
          .select("id, title, agency_id")
          .in("id", propertyIds);
        const agencyIds = Array.from(new Set((properties ?? []).map((p) => p.agency_id)));
        const { data: agencies } = await supabaseAdmin.from("agencies").select("id, name").in("id", agencyIds);

        const propertyById = new Map((properties ?? []).map((p) => [p.id, p]));
        const agencyNameById = new Map((agencies ?? []).map((a) => [a.id, a.name]));

        let sent = 0;
        let failed = 0;

        for (const checkin of due) {
          const property = propertyById.get(checkin.property_id);
          const agencyName = property ? (agencyNameById.get(property.agency_id) ?? "Your agency") : "Your agency";
          const body = buildCheckinMessage({
            propertyTitle: property?.title ?? "your property",
            contactType: checkin.contact_type,
            agencyName,
          });

          try {
            await sendCheckinMessage({ to: checkin.contact_phone, channel: checkin.channel, body });
            await supabaseAdmin
              .from("property_checkins")
              .update({ status: "sent", sent_at: new Date().toISOString(), provider_error: null })
              .eq("id", checkin.id);
            sent += 1;
          } catch (e) {
            await supabaseAdmin
              .from("property_checkins")
              .update({ status: "failed", provider_error: e instanceof Error ? e.message : "Unknown error" })
              .eq("id", checkin.id);
            failed += 1;
          }
        }

        return Response.json({ ok: true, processed: due.length, sent, failed });
      },
    },
  },
});
