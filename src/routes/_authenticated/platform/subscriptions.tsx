import { createFileRoute } from "@tanstack/react-router";
import { CreditCard } from "lucide-react";
import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const Route = createFileRoute("/_authenticated/platform/subscriptions")({
  head: () => ({ meta: [{ title: "Subscriptions — EstateOS" }] }),
  component: () => (
    <PlaceholderPage
      title="Subscriptions"
      description="Per-agency billing and plan status."
      icon={CreditCard}
      note="Subscription rows exist in the database (migration 0006: subscriptions + plans), but there is no billing UI and no payment provider is connected -- plan status is maintained by hand, and nothing in the app enforces a subscription. Per-agency plan details are on the agency detail page."
    />
  ),
});
