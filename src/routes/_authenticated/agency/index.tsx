import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Home, CheckCircle2, UserSquare2, CalendarCheck, Users, Plus } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { StatCard, EmptyState } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchAgencyStats } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/agency/")({
  head: () => ({ meta: [{ title: "Agency overview — EstateOS" }] }),
  component: AgencyDashboard,
});

function AgencyDashboard() {
  const { access } = Route.useRouteContext();
  const agencyId = access.agencyId!;

  const { data, isLoading } = useQuery({
    queryKey: ["agency-stats", agencyId],
    queryFn: () => fetchAgencyStats(agencyId),
  });

  return (
    <AppShell
      title={access.agencyName ?? "Agency overview"}
      description="How your agency is doing right now."
      actions={
        <Button asChild size="sm">
          <Link to="/agency/properties/new">
            <Plus className="size-4" /> Add property
          </Link>
        </Button>
      }
    >
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : !data || data.totalProperties + data.leads + data.employees === 0 ? (
        <EmptyState
          icon={Home}
          title="Your agency workspace is empty"
          description="Add your first property or invite a teammate to start building your inventory."
          action={
            <div className="mt-2 flex gap-2">
              <Button asChild>
                <Link to="/agency/properties/new">
                  <Plus className="size-4" /> Add a property
                </Link>
              </Button>
              <Button asChild variant="secondary">
                <Link to="/agency/team">Invite a teammate</Link>
              </Button>
            </div>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="Total properties" value={data.totalProperties} icon={Home} />
          <StatCard label="Available" value={data.availableProperties} icon={CheckCircle2} />
          <StatCard label="Leads" value={data.leads} icon={UserSquare2} />
          <StatCard label="Upcoming visits" value={data.upcomingVisits} icon={CalendarCheck} />
          <StatCard label="Employees" value={data.employees} icon={Users} />
        </div>
      )}
    </AppShell>
  );
}
