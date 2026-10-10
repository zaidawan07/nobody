import { createFileRoute } from '@tanstack/react-router'
import { SuperAdminDashboard } from "@/components/platform/SuperAdminDashboard";

export const Route = createFileRoute("/_authenticated/platform/")({
  head: () => ({ meta: [{ title: "Platform overview — EstateOS" }] }),
  component: SuperAdminDashboard,
});
