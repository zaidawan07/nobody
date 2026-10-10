import { createFileRoute } from "@tanstack/react-router";
import { Gauge } from "lucide-react";
import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const Route = createFileRoute("/_authenticated/platform/usage")({
  head: () => ({ meta: [{ title: "Usage — EstateOS" }] }),
  component: () => (
    <PlaceholderPage
      title="Usage"
      description="Per-agency usage against plan limits."
      icon={Gauge}
      note="The usage_counters table exists (migration 0006) but nothing in the app writes to it, so there are no usage figures to report here, and plan limits (plan_features) are not enforced anywhere. Real per-agency counts are shown on the agency detail page."
    />
  ),
});
