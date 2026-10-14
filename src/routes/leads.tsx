import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Plus, UserRound } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/useAccess";
import type { Database } from "@/integrations/supabase/types";

type LeadStatus = Database["public"]["Enums"]["lead_status"];
const statuses: LeadStatus[] = ["new", "contacted", "qualified", "visit_scheduled", "negotiating", "won", "lost"];
export const Route = createFileRoute("/leads")({
  ssr: false,
  beforeLoad: async () => { const { data, error } = await supabase.auth.getUser(); if (error || !data.user) throw redirect({ to: "/auth" }); },
  head: () => ({ meta: [{ title: "Leads — EstateOS" }] }),
  component: LeadsPage,
});
function LeadsPage() {
  const access = useAccess(), client = useQueryClient();
  const [showForm, setShowForm] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [name, setName] = useState(""), [phone, setPhone] = useState(""), [city, setCity] = useState(""), [requirement, setRequirement] = useState("");
  const list = useQuery({ queryKey: ["leads"], queryFn: async () => { const { data, error } = await supabase.from("leads").select("*").order("created_at", { ascending: false }); if (error) throw error; return data; } });
  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError("");
    if (!access.data?.agencyId) { setError("Your account is not linked to an agency."); return; }
    setBusy(true);
    const result = await supabase.from("leads").insert({ agency_id: access.data.agencyId, name: name.trim() || null, phone: phone.trim() || null, whatsapp_number: phone.trim() || null, preferred_city: city.trim() || null, requirement_text: requirement.trim() || null, status: "new" });
    setBusy(false);
    if (result.error) { setError(result.error.message); return; }
    setName(""); setPhone(""); setCity(""); setRequirement(""); setShowForm(false);
    await client.invalidateQueries({ queryKey: ["leads"] });
  }
  async function updateStatus(id: string, status: LeadStatus) {
    const result = await supabase.from("leads").update({ status }).eq("id", id);
    if (result.error) setError(result.error.message); else await client.invalidateQueries({ queryKey: ["leads"] });
  }
  return <AppShell title="Leads" description="Capture buyer and tenant requirements and keep every follow-up moving." actions={<button onClick={() => setShowForm(!showForm)} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"><Plus className="size-4" />{showForm ? "Cancel" : "Add lead"}</button>}>
    {showForm ? <form onSubmit={add} className="surface-panel mb-6 grid gap-4 p-5 md:grid-cols-2">
      <label className="space-y-1.5 text-sm font-medium">Customer name<input value={name} onChange={e => setName(e.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-input bg-background px-3 font-normal" /></label>
      <label className="space-y-1.5 text-sm font-medium">Phone / WhatsApp<input value={phone} onChange={e => setPhone(e.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-input bg-background px-3 font-normal" placeholder="+92…" /></label>
      <label className="space-y-1.5 text-sm font-medium">Preferred city<input value={city} onChange={e => setCity(e.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-input bg-background px-3 font-normal" placeholder="Lahore" /></label>
      <label className="space-y-1.5 text-sm font-medium">Requirement<textarea rows={2} value={requirement} onChange={e => setRequirement(e.target.value)} className="mt-1 block w-full rounded-lg border border-input bg-background p-3 font-normal" placeholder="Budget, property type, location, timeline…" /></label>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <div className="self-end"><button disabled={busy} className="h-10 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60">{busy ? "Saving…" : "Save lead"}</button></div>
    </form> : null}
    {error && !showForm ? <p role="alert" className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
    <div className="surface-panel overflow-hidden">{list.isLoading ? <p className="p-8 text-center text-sm text-muted-foreground">Loading leads…</p> : list.isError ? <p role="alert" className="p-8 text-center text-sm text-destructive">Could not load leads. Check database access.</p> : (list.data ?? []).length === 0 ? <div className="p-10 text-center"><UserRound className="mx-auto size-8 text-muted-foreground" /><h3 className="mt-3 font-semibold">No leads yet</h3><p className="mt-1 text-sm text-muted-foreground">Add a buyer or tenant requirement to start the pipeline.</p></div> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Requirement</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Created</th></tr></thead><tbody className="divide-y divide-border">{(list.data ?? []).map(l => <tr key={l.id}><td className="px-4 py-4"><p className="font-medium">{l.name || "Unnamed lead"}</p><p className="text-xs text-muted-foreground">{l.phone || "No phone"}{l.preferred_city ? " · " + l.preferred_city : ""}</p></td><td className="max-w-sm px-4 py-4 text-muted-foreground">{l.requirement_text || "—"}</td><td className="px-4 py-4"><select aria-label="Lead status" value={l.status} onChange={e => updateStatus(l.id, e.target.value as LeadStatus)} className="h-9 rounded-md border border-input bg-background px-2 text-xs">{statuses.map(s => <option key={s} value={s}>{s.replaceAll("_", " ")}</option>)}</select></td><td className="whitespace-nowrap px-4 py-4 text-xs text-muted-foreground">{new Date(l.created_at).toLocaleDateString()}</td></tr>)}</tbody></table></div>}</div>
  </AppShell>;
}
