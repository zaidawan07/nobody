import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserSquare2 } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { EmptyState, StatusBadge } from "@/components/shared/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchLeads, deleteLead, fetchAssignableMembers } from "@/lib/queries";
import { LeadDialog } from "@/components/leads/LeadDialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/agency/leads")({
  head: () => ({ meta: [{ title: "Leads — EstateOS" }] }),
  component: AgencyLeadsPage,
});

const statuses = ["new", "contacted", "qualified", "visit_scheduled", "negotiating", "won", "lost"];

function AgencyLeadsPage() {
  const { access } = Route.useRouteContext();
  const agencyId = access.agencyId!;
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [assigned, setAssigned] = useState<string | undefined>(undefined);
  const [propertyType, setPropertyType] = useState<string | undefined>(undefined);
  const [purpose, setPurpose] = useState<string | undefined>(undefined);
  const [city, setCity] = useState("");
  const [locality, setLocality] = useState("");
  const [minBudget, setMinBudget] = useState("");
  const [maxBudget, setMaxBudget] = useState("");
  const [page, setPage] = useState(1);
  const { data: members } = useQuery({ queryKey: ["assignable-members", agencyId], queryFn: () => fetchAssignableMembers(agencyId) });
  const { data, isLoading } = useQuery({ queryKey: ["leads", agencyId], queryFn: () => fetchLeads(agencyId) });
  const [leadDialog, setLeadDialog] = useState<{ mode: "create" | "edit"; lead?: any } | null>(null);

  const visitsFiltered = (data ?? [])
    .filter((l) => {
      if (status && l.status !== status) return false;
      if (assigned && l.assigned_to !== assigned) return false;
      if (propertyType && l.property_type !== propertyType) return false;
      if (purpose && l.purpose !== purpose) return false;
      if (city && !(l.preferred_city ?? "").toLowerCase().includes(city.toLowerCase())) return false;
      if (locality && !(l.preferred_locality ?? "").toLowerCase().includes(locality.toLowerCase())) return false;
      if (minBudget && l.budget_min_pkr != null && Number(l.budget_min_pkr) < Number(minBudget)) return false;
      if (maxBudget && l.budget_max_pkr != null && Number(l.budget_max_pkr) > Number(maxBudget)) return false;
      if (q) {
        const needle = q.toLowerCase();
        const hay = `${l.name ?? ""} ${l.phone ?? ""} ${l.whatsapp_number ?? ""} ${l.requirement_text ?? ""} ${l.preferred_city ?? ""} ${l.preferred_locality ?? ""} ${l.notes ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    })
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const pageSize = 20;
  const pages = Math.max(1, Math.ceil(visitsFiltered.length / pageSize));
  const pageData = visitsFiltered.slice((page - 1) * pageSize, page * pageSize);

  async function removeLead(id: string) {
    if (!confirm("Delete lead?")) return;
    try {
      await deleteLead(id);
      toast.success("Deleted");
      await queryClient.invalidateQueries({ queryKey: ["leads", agencyId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  return (
    <AppShell
      title="Leads"
      description="Everyone currently in your pipeline."
      actions={<Button size="sm" onClick={() => setLeadDialog({ mode: "create" })}>Add lead</Button>}
    >
      <div className="surface-panel mb-4 flex flex-wrap items-center gap-2 p-3">
        <Input placeholder="Search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} className="w-full sm:w-56" />
        <FilterSelect label="Status" value={status} onValue={(v) => { setStatus(v); setPage(1); }} items={["", ...statuses]} />
        <select aria-label="Assigned to"
          value={assigned ?? ""}
          onChange={(e) => { setAssigned(e.target.value || undefined); setPage(1); }}
          className="rounded-md border border-border bg-background px-2 py-2 text-sm">
          <option value="">All assigned</option>
          {(members ?? []).map((m) => (<option key={m.id} value={m.id}>{m.full_name ?? "Unnamed"}</option>))}
        </select>
        <FilterSelect label="Type" value={propertyType} onValue={(v) => { setPropertyType(v); setPage(1); }} items={["", "house", "apartment", "plot", "commercial", "office", "shop", "warehouse", "agricultural"]} />
        <FilterSelect label="Purpose" value={purpose} onValue={(v) => { setPurpose(v); setPage(1); }} items={["", "sale", "rent"]} />
        <Input placeholder="City" value={city} onChange={(e) => { setCity(e.target.value); setPage(1); }} className="w-32" />
        <Input placeholder="Locality" value={locality} onChange={(e) => { setLocality(e.target.value); setPage(1); }} className="w-32" />
        <Input placeholder="Min budget" value={minBudget} onChange={(e) => { setMinBudget(e.target.value); setPage(1); }} className="w-28" />
        <Input placeholder="Max budget" value={maxBudget} onChange={(e) => { setMaxBudget(e.target.value); setPage(1); }} className="w-28" />
      </div>
      {isLoading ? (
        <Skeleton className="h-32 rounded-xl" />
      ) : visitsFiltered.length === 0 ? (
        <EmptyState
          icon={UserSquare2}
          title="No leads yet"
          description="Leads captured from WhatsApp or added manually will show up here."
          action={<Button size="sm" className="mt-2" onClick={() => setLeadDialog({ mode: "create" })}>Add your first lead</Button>}
        />
      ) : (
        <>
          <div className="surface-panel overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Assigned to</TableHead>
                  <TableHead>Property type</TableHead>
                  <TableHead>Purpose</TableHead>
                  <TableHead>Budget</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visitsFiltered.length && pageData.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium text-foreground">{l.name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{l.phone ?? l.whatsapp_number ?? "—"}</TableCell>
                    <TableCell><StatusBadge status={l.status} /></TableCell>
                    <TableCell className="text-muted-foreground">{l.assignee_name ?? "Unassigned"}</TableCell>
                    <TableCell className="text-muted-foreground">{l.property_type ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{l.purpose ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{hudget(l.budget_min_pkr, l.budget_max_pkr)}</TableCell>
                    <TableCell className="text-muted-foreground">{l.preferred_city ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="sm" variant="secondary" onClick={() => setLeadDialog({ mode: "edit", lead: l })}>Edit</Button>
                        <Button size="sm" variant="ghost" onClick={() => removeLead(l.id)}>Delete</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="mt-3 flex items-center justify-between text-sm">
            <span>{clientTotalText(visitsFiltered.length)}</span>
            <div className="flex gap-1">
              <Button variant="secondary" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Prev</Button>
              <span className="flex items-center px-2">{page} / {pages}</span>
              <Button variant="secondary" size="sm" onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages}>Next</Button>
            </div>
          </div>
        </>
      )}
      <LeadDialog open={leadDialog !== null} onOpenChange={() => setLeadDialog(null)} lead={leadDialog?.lead} agencyId={agencyId} />
    </AppShell>
  );
}

function FilterSelect({ label, value, onValue, items }: { label: string; value: string | undefined; onValue: (v: string | undefined) => void; items: string[] }) {
  return (
    <Select value={value ?? ""} onValueChange={(v) => onValue(v === "" ? undefined : v)}>
      <SelectTrigger className="w-32"><SelectValue placeholder={label} /></SelectTrigger>
      <SelectContent>
        {items.map((v) => (<SelectItem key={v} value={v}>{v === "" ? `All ${label.toLowerCase()}s` : v}</SelectItem>))}
      </SelectContent>
    </Select>
  );
}

function hudget(min: number | null, max: number | null): string {
  if (min == null && max == null) return "—";
  const a = min != null ? min.toLocaleString("en-PK") : "?";
  const b = max != null ? max.toLocaleString("en-PK") : "?";
  return `PKR ${a} – ${b}`;
}
function clientTotalText(n: number): string {
  return `${n} lead${n === 1 ? "" : "s"}`;
}
