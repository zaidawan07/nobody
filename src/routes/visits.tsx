import { useMemo, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { CalendarCheck, Pencil, Search } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/useAccess";
import type { Database } from "@/integrations/supabase/types";

type VisitStatus = Database["public"]["Enums"]["visit_status"];
type VisitRow = Database["public"]["Tables"]["site_visits"]["Row"];
const statuses: VisitStatus[] = ["requested", "confirmed", "completed", "cancelled", "no_show"];

function toLocalDateTimeInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export const Route = createFileRoute("/visits")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
  },
  head: () => ({ meta: [{ title: "Site visits — EstateOS" }] }),
  component: VisitsPage,
});

function VisitsPage() {
  const access = useAccess();
  const client = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scheduled, setScheduled] = useState("");
  const [notes, setNotes] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [leadId, setLeadId] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<VisitStatus | "all">("all");
  const [error, setError] = useState("");

  const list = useQuery({
    queryKey: ["site-visits", access.data?.agencyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("site_visits").select("*").order("scheduled_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
  const refs = useQuery({
    queryKey: ["visit-references", access.data?.agencyId],
    queryFn: async () => {
      const [properties, leads, profiles] = await Promise.all([
        supabase.from("properties").select("id,title"),
        supabase.from("leads").select("id,name,phone"),
        access.data?.agencyId
          ? supabase.from("profiles").select("id,full_name,phone,job_title").eq("agency_id", access.data.agencyId)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (properties.error) throw properties.error;
      if (leads.error) throw leads.error;
      if (profiles.error) throw profiles.error;
      return { properties: properties.data, leads: leads.data, profiles: profiles.data ?? [] };
    },
    enabled: !!access.data,
  });

  const properties = new Map((refs.data?.properties ?? []).map((item) => [item.id, item.title]));
  const leads = new Map((refs.data?.leads ?? []).map((item) => [item.id, item.name || item.phone || "Lead"]));
  const teammates = new Map((refs.data?.profiles ?? []).map((item) => [item.id, item.full_name || item.phone || "Team member"]));

  const filteredVisits = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return (list.data ?? []).filter((visit) => {
      const matchesSearch =
        !query ||
        [properties.get(visit.property_id ?? ""), leads.get(visit.lead_id ?? ""), visit.notes, teammates.get(visit.assigned_to ?? "")]
          .some((value) => value?.toLocaleLowerCase().includes(query));
      return matchesSearch && (statusFilter === "all" || visit.status === statusFilter);
    });
  }, [list.data, search, statusFilter, refs.data]);

  function resetForm() {
    setEditingId(null);
    setScheduled("");
    setNotes("");
    setPropertyId("");
    setLeadId("");
    setAssignedTo("");
    setError("");
  }

  function startEditing(visit: VisitRow) {
    setEditingId(visit.id);
    setScheduled(toLocalDateTimeInput(visit.scheduled_at));
    setNotes(visit.notes ?? "");
    setPropertyId(visit.property_id ?? "");
    setLeadId(visit.lead_id ?? "");
    setAssignedTo(visit.assigned_to ?? "");
    setError("");
    setShowForm(true);
  }

  async function saveVisit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!access.data?.agencyId) {
      setError("Your account is not linked to an agency.");
      return;
    }
    if (scheduled && Number.isNaN(new Date(scheduled).getTime())) {
      setError("Choose a valid scheduled date and time.");
      return;
    }
    if (propertyId && !properties.has(propertyId)) {
      setError("Choose a property from your agency.");
      return;
    }
    if (leadId && !leads.has(leadId)) {
      setError("Choose a lead from your agency.");
      return;
    }
    if (assignedTo && !teammates.has(assignedTo)) {
      setError("Choose a teammate from your agency.");
      return;
    }

    setBusy(true);
    try {
      const values = {
        property_id: propertyId || null,
        lead_id: leadId || null,
        assigned_to: assignedTo || null,
        scheduled_at: scheduled ? new Date(scheduled).toISOString() : null,
        notes: notes.trim() || null,
      };
      const result = editingId
        ? await supabase.from("site_visits").update(values).eq("id", editingId)
        : await supabase.from("site_visits").insert({
            ...values,
            agency_id: access.data.agencyId,
            requested_at: new Date().toISOString(),
            status: "requested",
          });
      if (result.error) throw result.error;
      resetForm();
      setShowForm(false);
      await client.invalidateQueries({ queryKey: ["site-visits"] });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the visit.");
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(id: string, status: VisitStatus) {
    setError("");
    const result = await supabase.from("site_visits").update({ status, confirmed: status === "confirmed" }).eq("id", id);
    if (result.error) setError(result.error.message);
    else await client.invalidateQueries({ queryKey: ["site-visits"] });
  }

  function toggleForm() {
    if (showForm) {
      resetForm();
      setShowForm(false);
    } else {
      resetForm();
      setShowForm(true);
    }
  }

  return (
    <AppShell
      title="Site visits"
      description="Coordinate property viewings, assign an agent, and track confirmations."
      actions={<button onClick={toggleForm} className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">{showForm ? "Cancel" : "Schedule visit"}</button>}
    >
      {showForm ? (
        <form onSubmit={saveVisit} className="surface-panel mb-6 grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
          <label className="space-y-1.5 text-sm font-medium">
            Property
            <select value={propertyId} onChange={(event) => setPropertyId(event.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-input bg-background px-3 font-normal">
              <option value="">Select property (optional)</option>
              {(refs.data?.properties ?? []).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Lead
            <select value={leadId} onChange={(event) => setLeadId(event.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-input bg-background px-3 font-normal">
              <option value="">Select lead (optional)</option>
              {(refs.data?.leads ?? []).map((item) => <option key={item.id} value={item.id}>{item.name || item.phone || "Unnamed lead"}</option>)}
            </select>
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Assigned agent
            <select value={assignedTo} onChange={(event) => setAssignedTo(event.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-input bg-background px-3 font-normal">
              <option value="">Unassigned</option>
              {(refs.data?.profiles ?? []).map((item) => <option key={item.id} value={item.id}>{item.full_name || item.phone || "Team member"}</option>)}
            </select>
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Scheduled time
            <input type="datetime-local" value={scheduled} onChange={(event) => setScheduled(event.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-input bg-background px-3 font-normal" />
          </label>
          <label className="space-y-1.5 text-sm font-medium md:col-span-2">
            Notes
            <input maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-input bg-background px-3 font-normal" placeholder="Meeting point, preferences, next steps…" />
          </label>
          {error ? <p role="alert" className="text-sm text-destructive md:col-span-2">{error}</p> : null}
          <div className="flex items-center gap-2 self-end">
            <button disabled={busy} className="h-10 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60">{busy ? "Saving…" : editingId ? "Save changes" : "Create visit"}</button>
            {editingId ? <button type="button" onClick={toggleForm} className="h-10 rounded-lg border border-input px-4 text-sm">Cancel edit</button> : null}
          </div>
        </form>
      ) : null}

      {error && !showForm ? <p role="alert" className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}

      <div className="surface-panel mb-4 flex flex-col gap-3 p-3 sm:flex-row">
        <label className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input aria-label="Search visits" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search property, lead, agent, or notes…" className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm" />
        </label>
        <select aria-label="Filter visits by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as VisitStatus | "all")} className="h-10 rounded-lg border border-input bg-background px-3 text-sm">
          <option value="all">All statuses</option>
          {statuses.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}
        </select>
      </div>

      <div className="surface-panel overflow-hidden">
        {list.isLoading || refs.isLoading ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Loading visits…</p>
        ) : list.isError || refs.isError ? (
          <p role="alert" className="p-8 text-center text-sm text-destructive">Could not load site visits or their related records.</p>
        ) : (list.data ?? []).length === 0 ? (
          <div className="p-10 text-center">
            <CalendarCheck className="mx-auto size-8 text-muted-foreground" />
            <h3 className="mt-3 font-semibold">No site visits yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">Create a visit request to get started.</p>
          </div>
        ) : filteredVisits.length === 0 ? (
          <div className="p-10 text-center">
            <Search className="mx-auto size-8 text-muted-foreground" />
            <h3 className="mt-3 font-semibold">No matching visits</h3>
            <p className="mt-1 text-sm text-muted-foreground">Try another search or status filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr><th className="px-4 py-3">Scheduled</th><th className="px-4 py-3">Property</th><th className="px-4 py-3">Lead</th><th className="px-4 py-3">Assigned agent</th><th className="px-4 py-3">Notes</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredVisits.map((visit) => (
                  <tr key={visit.id}>
                    <td className="whitespace-nowrap px-4 py-4">{visit.scheduled_at ? new Date(visit.scheduled_at).toLocaleString() : "Not scheduled"}</td>
                    <td className="px-4 py-4">{properties.get(visit.property_id ?? "") || "—"}</td>
                    <td className="px-4 py-4">{leads.get(visit.lead_id ?? "") || "—"}</td>
                    <td className="px-4 py-4">{teammates.get(visit.assigned_to ?? "") || "Unassigned"}</td>
                    <td className="max-w-xs px-4 py-4 text-muted-foreground">{visit.notes || "—"}</td>
                    <td className="px-4 py-4">
                      <select aria-label={`Status for visit ${visit.id}`} value={visit.status} onChange={(event) => updateStatus(visit.id, event.target.value as VisitStatus)} className="h-9 rounded-md border border-input bg-background px-2 text-xs">
                        {statuses.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-4">
                      <button onClick={() => startEditing(visit)} className="inline-flex h-9 items-center gap-2 rounded-md border border-input px-3 text-xs font-medium"><Pencil className="size-3.5" /> Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
