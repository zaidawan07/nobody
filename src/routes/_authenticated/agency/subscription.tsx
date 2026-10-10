import { createFileRoute } from "@tanstack/react-router";
import { CreditCard } from "lucide-react";
import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const Route = createFileRoute("/_authenticated/agency/subscription")({
  head: () => ({ meta: [{ title: "Subscription — EstateOS" }] }),
  component: () => (
    <PlaceholderPage
      title="Subscription"
      description="Your agency's plan and billing."
      icon={CreditCard}
      note="Billing isn't set up yet -- your agency isn't being charged or limited by a plan right now."
    />
  ),
});
