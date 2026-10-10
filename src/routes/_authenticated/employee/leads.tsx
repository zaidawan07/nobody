import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { UserSquare2 } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { EmptyState, StatusBadge } from "@/components/shared/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { fetchLeads } from "@/lib/queries";
import { LeadDialog } from "@/components/leads/LeadDialog";

export const Route = createFileRoute("/_authenticated/employee/leads")({
  head: () => ({ meta: [{ title: "Leads — EstateOS" }] }),
  component: EmployeeLeadsPage,
});

function EmployeeLeadsPage() {
  const { access } = Route.useRouteContext();
  const agencyId = access.agencyId!;
  const { data, isLoading } = useQuery({ queryKey: ["leads", agencyId], queryFn: () => fetchLeads(agencyId) });
  const [editing, setEditing] = useState<any>(null);

  return (
    <AppShell title="My leads" description="Leads assigned to you.">
      {isLoading ? (
        <Skeleton className="h-32 rounded-xl" />
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={UserSquare2}
          title="No leads yet"
          description="Leads captured from WhatsApp or added manually will show up here."
        />
      ) : (
        <div className="surface-panel overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Assigned to</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium text-foreground">{l.name}</TableCell>
                  <TableCell className="text-muted-foreground">{l.phone ?? l.whatsapp_number ?? "—"}</TableCell>
                  <TableCell>
                    <StatusBadge status={l.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{l.assignee_name ?? "Unassigned"}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="secondary" onClick={() => setEditing(l)}>Update</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <LeadDialog open={editing !== null} onOpenChange={() => setEditing(null)} lead={editing} agencyId={agencyId} role={access.role ?? "employee"} />
    </AppShell>
  );
}
