import { useMemo, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Pencil, Plus, Search, UserRound } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/useAccess";
import type { Database } from "@/integrations/supabase/types";

type LeadStatus = Database["public"]["Enums"]["lead_status"];
type PropertyType = Database["public"]["Enums"]["property_type"];
type Purpose = Database["public"]["Enums"]["property_purpose"];
type LeadRow = Database["public"]["Tables"]["leads"]["Row"];

const statuses: LeadStatus[] = ["new", "contacted", "qualified", "visit_scheduled", "negotiating", "won", "lost"];
const propertyTypes: PropertyType[] = ["house", "apartment", "plot", "commercial", "office", "shop", "warehouse", "agricultural"];

export const Route = createFileRoute("/leads")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
  },
  head: () => ({ meta: [{ title: "Leads — EstateOS" }] }),
  component: LeadsPage,
});

function LeadsPage() {
  const access = useAccess();
  const client = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all">("all");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [requirement, setRequirement] = useState("");
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [propertyType, setPropertyType] = useState<PropertyType | "">("");
  const [purpose, setPurpose] = useState<Purpose | "">("");
  const [assignedTo, setAssignedTo] = useState("");

  const team = useQuery({
    queryKey: ["lead-assignees", access.data?.agencyId],
    enabled: !!access.data?.agencyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id,full_name,phone").eq("agency_id", access.data!.agencyId!);
      if (error) throw error;
      return data;
    },
  });
  const teammates = new Map((team.data ?? []).map((member) => [member.id, member.full_name || member.phone || "Team member"]));

  const list = useQuery({
    queryKey: ["leads", access.data?.agencyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filteredLeads = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return (list.data ?? []).filter((lead) => {
      const matchesSearch =
        !query ||
        [lead.name, lead.phone, lead.whatsapp_number, lead.preferred_city, lead.preferred_locality, lead.requirement_text]
          .some((value) => value?.toLocaleLowerCase().includes(query));
      return matchesSearch && (statusFilter === "all" || lead.status === statusFilter);
    });
  }, [list.data, search, statusFilter, team.data]);

  function resetForm() {
    setEditingId(null);
    setName("");
    setPhone("");
    setCity("");
    setRequirement("");
    setBudgetMin("");
    setBudgetMax("");
    setPropertyType("");
    setPurpose("");
    setAssignedTo("");
    setError("");
  }

  function startEditing(lead: LeadRow) {
    setEditingId(lead.id);
    setName(lead.name ?? "");
    setPhone(lead.phone ?? lead.whatsapp_number ?? "");
    setCity(lead.preferred_city ?? "");
    setRequirement(lead.requirement_text ?? "");
    setBudgetMin(lead.budget_min_pkr == null ? "" : String(lead.budget_min_pkr));
    setBudgetMax(lead.budget_max_pkr == null ? "" : String(lead.budget_max_pkr));
    setPropertyType(lead.property_type ?? "");
    setPurpose(lead.purpose ?? "");
    setAssignedTo(lead.assigned_to ?? "");
    setError("");
    setShowForm(true);
  }

  async function saveLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!access.data?.agencyId) {
      setError("Your account is not linked to an agency.");
      return;
    }
    if (!name.trim() && !phone.trim()) {
      setError("Enter at least a customer name or phone number.");
      return;
    }

    const min = budgetMin.trim() ? Number(budgetMin) : null;
    const max = budgetMax.trim() ? Number(budgetMax) : null;
    if ((min !== null && (!Number.isFinite(min) || min < 0)) || (max !== null && (!Number.isFinite(max) || max < 0))) {
      setError("Budgets must be valid non-negative amounts.");
      return;
    }
    if (assignedTo && !teammates.has(assignedTo)) {
      setError("Choose a teammate from your agency.");
      return;
    }
    if (min !== null && max !== null && min > max) {
      setError("Minimum budget cannot exceed maximum budget.");
      return;
    }

    setBusy(true);
    try {
      const normalizedPhone = phone.trim() || null;
      const values = {
        name: name.trim() || null,
        phone: normalizedPhone,
        whatsapp_number: normalizedPhone,
        preferred_city: city.trim() || null,
        requirement_text: requirement.trim() || null,
        budget_min_pkr: min,
        budget_max_pkr: max,
        property_type: propertyType || null,
        purpose: purpose || null,
        assigned_to: assignedTo || null,
      };
      const result = editingId
        ? await supabase.from("leads").update(values).eq("id", editingId)
        : await supabase.from("leads").insert({ ...values, agency_id: access.data.agencyId, status: "new" });
      if (result.error) throw result.error;
      resetForm();
      setShowForm(false);
      await client.invalidateQueries({ queryKey: ["leads"] });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the lead.");
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(id: string, status: LeadStatus) {
    setError("");
    const result = await supabase.from("leads").update({ status }).eq("id", id);
    if (result.error) setError(result.error.message);
    else await client.invalidateQueries({ queryKey: ["leads"] });
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
      title="Leads"
      description="Capture buyer and tenant requirements and keep every follow-up moving."
      actions={
        <button onClick={toggleForm} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">
          <Plus className="size-4" />{showForm ? "Cancel" : "Add lead"}
        </button>
      }
    >
      {showForm ? (
        <form onSubmit={saveLead} className="surface-panel mb-6 grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
          <label className="space-y-1.5 text-sm font-medium">
            Customer name
            <input maxLength={200} value={name} onChange={(event) => setName(event.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-input bg-background px-3 font-normal" />
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Phone / WhatsApp
            <input maxLength={40} value={phone} onChange={(event) => setPhone(event.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-input bg-background px-3 font-normal" placeholder="+92…" />
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Preferred city
            <input maxLength={100} value={city} onChange={(event) => setCity(event.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-input bg-background px-3 font-normal" placeholder="Lahore" />
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Minimum budget (PKR)
            <input type="number" min="0" step="0.01" value={budgetMin} onChange={(event) => setBudgetMin(event.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-input bg-background px-3 font-normal" />
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Maximum budget (PKR)
            <input type="number" min="0" step="0.01" value={budgetMax} onChange={(event) => setBudgetMax(event.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-input bg-background px-3 font-normal" />
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Property type
            <select value={propertyType} onChange={(event) => setPropertyType(event.target.value as PropertyType | "")} className="mt-1 block h-10 w-full rounded-lg border border-input bg-background px-3 font-normal">
              <option value="">Any type</option>
              {propertyTypes.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Assigned agent
            <select value={assignedTo} onChange={(event) => setAssignedTo(event.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-input bg-background px-3 font-normal">
              <option value="">Unassigned</option>
              {(team.data ?? []).map((member) => <option key={member.id} value={member.id}>{member.full_name || member.phone || "Team member"}</option>)}
            </select>
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Purpose
            <select value={purpose} onChange={(event) => setPurpose(event.target.value as Purpose | "")} className="mt-1 block h-10 w-full rounded-lg border border-input bg-background px-3 font-normal">
              <option value="">Sale or rent</option>
              <option value="sale">Sale</option>
              <option value="rent">Rent</option>
            </select>
          </label>
          <label className="space-y-1.5 text-sm font-medium md:col-span-2">
            Requirement
            <textarea maxLength={5000} rows={2} value={requirement} onChange={(event) => setRequirement(event.target.value)} className="mt-1 block w-full rounded-lg border border-input bg-background p-3 font-normal" placeholder="Budget, property type, location, timeline…" />
          </label>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <div className="flex items-center gap-2 self-end">
            <button disabled={busy} className="h-10 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
              {busy ? "Saving…" : editingId ? "Save changes" : "Save lead"}
            </button>
            {editingId ? <button type="button" onClick={toggleForm} className="h-10 rounded-lg border border-input px-4 text-sm">Cancel edit</button> : null}
          </div>
        </form>
      ) : null}

      {error && !showForm ? <p role="alert" className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}

      <div className="surface-panel mb-4 flex flex-col gap-3 p-3 sm:flex-row">
        <label className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input aria-label="Search leads" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, phone, city, or requirement…" className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm" />
        </label>
        <select aria-label="Filter leads by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as LeadStatus | "all")} className="h-10 rounded-lg border border-input bg-background px-3 text-sm">
          <option value="all">All statuses</option>
          {statuses.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}
        </select>
      </div>

      <div className="surface-panel overflow-hidden">
        {list.isLoading ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Loading leads…</p>
        ) : list.isError ? (
          <p role="alert" className="p-8 text-center text-sm text-destructive">Could not load leads. Check database access.</p>
        ) : (list.data ?? []).length === 0 ? (
          <div className="p-10 text-center">
            <UserRound className="mx-auto size-8 text-muted-foreground" />
            <h3 className="mt-3 font-semibold">No leads yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">Add a buyer or tenant requirement to start the pipeline.</p>
          </div>
        ) : filteredLeads.length === 0 ? (
          <div className="p-10 text-center">
            <Search className="mx-auto size-8 text-muted-foreground" />
            <h3 className="mt-3 font-semibold">No matching leads</h3>
            <p className="mt-1 text-sm text-muted-foreground">Try another search or clear the status filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Requirement</th><th className="px-4 py-3">Budget</th><th className="px-4 py-3">Assigned agent</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Created</th><th className="px-4 py-3">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredLeads.map((lead) => (
                  <tr key={lead.id}>
                    <td className="px-4 py-4">
                      <p className="font-medium">{lead.name || "Unnamed lead"}</p>
                      <p className="text-xs text-muted-foreground">{lead.phone || "No phone"}{lead.preferred_city ? " · " + lead.preferred_city : ""}</p>
                    </td>
                    <td className="max-w-sm px-4 py-4 text-muted-foreground">
                      <p>{lead.requirement_text || "—"}</p>
                      {lead.property_type || lead.purpose ? <p className="mt-1 text-xs capitalize">{[lead.property_type, lead.purpose].filter(Boolean).join(" · ")}</p> : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-xs">
                      {lead.budget_min_pkr == null && lead.budget_max_pkr == null ? "—" : `PKR ${lead.budget_min_pkr?.toLocaleString("en-PK") ?? "0"} – ${lead.budget_max_pkr?.toLocaleString("en-PK") ?? "no max"}`}
                    </td>
                    <td className="px-4 py-4">{teammates.get(lead.assigned_to ?? "") || "Unassigned"}</td>
                    <td className="px-4 py-4">
                      <select aria-label={`Status for ${lead.name || lead.phone || "lead"}`} value={lead.status} onChange={(event) => updateStatus(lead.id, event.target.value as LeadStatus)} className="h-9 rounded-md border border-input bg-background px-2 text-xs">
                        {statuses.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}
                      </select>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-xs text-muted-foreground">{new Date(lead.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-4">
                      <button onClick={() => startEditing(lead)} className="inline-flex h-9 items-center gap-2 rounded-md border border-input px-3 text-xs font-medium"><Pencil className="size-3.5" /> Edit</button>
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
