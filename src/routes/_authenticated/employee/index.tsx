import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Home, UserSquare2, CalendarCheck } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { StatCard, EmptyState } from "@/components/shared/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchEmployeeStats } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/employee/")({
  head: () => ({ meta: [{ title: "My work — EstateOS" }] }),
  component: EmployeeDashboard,
});

function EmployeeDashboard() {
  const { access } = Route.useRouteContext();

  const { data, isLoading } = useQuery({
    queryKey: ["employee-stats", access.userId],
    queryFn: () => fetchEmployeeStats(access.userId),
  });

  return (
    <AppShell title={`Hi, ${access.fullName ?? "there"}`} description="What's assigned to you right now.">
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : !data || data.assignedProperties + data.assignedLeads + data.upcomingVisits === 0 ? (
        <EmptyState
          icon={Home}
          title="Nothing assigned to you yet"
          description="When your agency admin assigns you a property, lead, or site visit, it'll show up here."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Assigned properties" value={data.assignedProperties} icon={Home} />
          <StatCard label="Assigned leads" value={data.assignedLeads} icon={UserSquare2} />
          <StatCard label="Upcoming visits" value={data.upcomingVisits} icon={CalendarCheck} />
        </div>
      )}
    </AppShell>
  );
}
