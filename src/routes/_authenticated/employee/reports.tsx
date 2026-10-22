import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { ReportsPanel } from "@/components/reports/ReportsPanel";

export const Route = createFileRoute("/_authenticated/employee/reports")({
  head: () => ({ meta: [{ title: "My reports — EstateOS" }] }),
  component: EmployeeReportsPage,
});

function EmployeeReportsPage() {
  const { access } = Route.useRouteContext();
  const agencyId = access.agencyId!;

  return (
    <AppShell title="My reports" description="Your leads, properties and visits, counted.">
      <ReportsPanel agencyId={agencyId} />
    </AppShell>
  );
}
