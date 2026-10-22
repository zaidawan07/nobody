import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { ReportsPanel } from "@/components/reports/ReportsPanel";

export const Route = createFileRoute("/_authenticated/agency/reports")({
  head: () => ({ meta: [{ title: "Reports — EstateOS" }] }),
  component: AgencyReportsPage,
});

function AgencyReportsPage() {
  const { access } = Route.useRouteContext();
  const agencyId = access.agencyId!;

  return (
    <AppShell
      title="Reports"
      description="How the agency is doing, counted from the rows you can see."
    >
      <ReportsPanel agencyId={agencyId} />
    </AppShell>
  );
}
