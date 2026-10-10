import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { EmptyState, StatusBadge } from "@/components/shared/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchVisits, deleteVisit, fetchAssignableMembers } from "@/lib/queries";
import { VisitDialog } from "@/components/leads/VisitDialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/agency/visits")({
  head: () => ({ meta: [{ title: "Site visits — EstateOS" }] }),
  component: AgencyVisitsPage,
});

function AgencyVisitsPage() {
  const { access } = Route.useRouteContext();
  const agencyId = access.agencyId!;
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [assigned, setAssigned] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const [visitDialog, setVisitDialog] = useState<{ mode: "create" | "edit"; visit?: any } | null>(null);
  const { data: members } = useQuery({ queryKey: ["assignable-members", agencyId], queryFn: () => fetchAssignableMembers(agencyId) });
  const { data, isLoading } = useQuery({ queryKey: ["visits", agencyId], queryFn: () => fetchVisits(agencyId) });

  const pageSize = 20;
  const filtered = (data ?? []).filter((v) => {
    if (statusFilter && v.status !== statusFilter) return false;
    if (assigned && v.assigned_to !== assigned) return false;
    if (q) {
      const n = q.toLowerCase();
      const hay = `${v.property_title ?? ""} ${v.lead_name ?? ""} ${v.notes ?? ""}`.toLowerCase();
      if (!hay.includes(n)) return false;
    }
    return true;
  }).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const rows = filtered.slice((page - 1) * pageSize, page * pageSize);

  async function remove(id: string) {
    if (!confirm("Delete visit?")) return;
    try {
      await deleteVisit(id);
      toast.success("Deleted");
      await queryClient.invalidateQueries({ queryKey: ["visits", agencyId] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Delete failed"); }
  }

  return (
    <AppShell
      title="Site visits"
      description="Scheduled and requested property visits."
      actions={<Button size="sm" onClick={() => setVisitDialog({ mode: "create" })}>Schedule visit</Button>}
    >
      <div className="surface-panel mb-4 flex flex-wrap gap-2 p-3">
        <Input placeholder="Search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} className="w-full sm:w-56" />
        <select aria-label="Status" value={statusFilter ?? ""} onChange={(e) => { setStatusFilter(e.target.value || undefined); setPage(1); }} className="rounded-md border border-border bg-background px-2 py-2 text-sm">
          <option value="">All statuses</option>
          {["requested", "confirmed", "completed", "cancelled", "no_show"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select aria-label="Assigned to" value={assigned ?? ""} onChange={(e) => { setAssigned(e.target.value || undefined); setPage(1); }} className="rounded-md border border-border bg-background px-2 py-2 text-sm">
          <option value="">All assigned</option>
          {(members ?? []).map((m) => <option key={m.id} value={m.id}>{m.full_name ?? "Unnamed"}</option>)}
        </select>
      </div>
      {isLoading ? (
        <Skeleton className="h-32 rounded-xl" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title="No site visits yet"
          description="Visits requested by leads or scheduled by your team will show up here."
          action={<Button size="sm" className="mt-2" onClick={() => setVisitDialog({ mode: "create" })}>Schedule your first visit</Button>}
        />
      ) : (
        <>
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
                {rows.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium text-foreground">{v.property_title ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{v.lead_name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{v.scheduled_at ? new Date(v.scheduled_at).toLocaleString() : "Not yet scheduled"}</TableCell>
                    <TableCell><StatusBadge status={v.status} /></TableCell>
                    <TableCell className="text-muted-foreground">{v.assignee_name ?? "Unassigned"}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="sm" variant="secondary" onClick={() => setVisitDialog({ mode: "edit", visit: v })}>Edit</Button>
                        <Button size="sm" variant="ghost" onClick={() => remove(v.id)}>Delete</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="mt-3 flex items-center justify-between text-sm">
            <span>{filtered.length} visit{filtered.length === 1 ? "" : "s"}</span>
            <div className="flex gap-1">
              <Button variant="secondary" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Prev</Button>
              <span className="flex items-center px-2">{page} / {pages}</span>
              <Button variant="secondary" size="sm" onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages}>Next</Button>
            </div>
          </div>
        </>
      )}
      <VisitDialog open={visitDialog !== null} onOpenChange={() => setVisitDialog(null)} visit={visitDialog?.visit} agencyId={agencyId} />
    </AppShell>
  );
}
