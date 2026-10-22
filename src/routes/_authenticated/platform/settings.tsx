import { createFileRoute } from "@tanstack/react-router";
import { Settings } from "lucide-react";
import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const Route = createFileRoute("/_authenticated/platform/settings")({
  head: () => ({ meta: [{ title: "Platform settings — EstateOS" }] }),
  component: () => (
    <PlaceholderPage
      title="Platform settings"
      description="Platform-wide configuration."
      icon={Settings}
      note="There is no platform-settings table in the schema (migrations 0000-0007): platform-wide configuration lives on the Agencies and Plans pages."
    />
  ),
});
