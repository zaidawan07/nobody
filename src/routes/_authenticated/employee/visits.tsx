import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { EmptyState, StatusBadge } from "@/components/shared/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { fetchVisits } from "@/lib/queries";
import { VisitDialog } from "@/components/leads/VisitDialog";

export const Route = createFileRoute("/_authenticated/employee/visits")({
  head: () => ({ meta: [{ title: "Site visits — EstateOS" }] }),
  component: EmployeeVisitsPage,
});

function EmployeeVisitsPage() {
  const { access } = Route.useRouteContext();
  const agencyId = access.agencyId!;
  const { data, isLoading } = useQuery({ queryKey: ["visits", agencyId], queryFn: () => fetchVisits(agencyId) });
  const [editing, setEditing] = useState<any>(null);

  return (
    <AppShell title="My visits" description="Visits assigned to you.">
      {isLoading ? (
        <Skeleton className="h-32 rounded-xl" />
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title="No site visits yet"
          description="Visits requested by leads or scheduled by your team will show up here."
        />
      ) : (
        <div className="surface-panel overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Property</TableHead>
                <TableHead>Lead</TableHead>
                <TableHead>Scheduled</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Assigned to</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="font-medium text-foreground">{v.property_title ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{v.lead_name ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {v.scheduled_at ? new Date(v.scheduled_at).toLocaleString() : "Not yet scheduled"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={v.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{v.assignee_name ?? "Unassigned"}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="secondary" onClick={() => setEditing(v)}>Update</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <VisitDialog open={editing !== null} onOpenChange={() => setEditing(null)} visit={editing} agencyId={agencyId} role={access.role ?? "employee"} />
    </AppShell>
  );
}
