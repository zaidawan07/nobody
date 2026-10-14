import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Home, Plus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/useAccess";
import type { Database } from "@/integrations/supabase/types";

type PropertyType = Database["public"]["Enums"]["property_type"];
type Purpose = Database["public"]["Enums"]["property_purpose"];
type Status = Database["public"]["Enums"]["property_status"];
export const Route = createFileRoute("/properties")({
  ssr: false,
  beforeLoad: async () => { const { data, error } = await supabase.auth.getUser(); if (error || !data.user) throw redirect({ to: "/auth" }); },
  head: () => ({ meta: [{ title: "Properties — EstateOS" }] }),
  component: PropertiesPage,
});
const types: PropertyType[] = ["house", "apartment", "plot", "commercial", "office", "shop", "warehouse", "agricultural"];
function PropertiesPage() {
  const access = useAccess(), client = useQueryClient();
  const [showForm, setShowForm] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [title, setTitle] = useState(""), [city, setCity] = useState(""), [price, setPrice] = useState("");
  const [type, setType] = useState<PropertyType>("house"), [purpose, setPurpose] = useState<Purpose>("sale");
  const list = useQuery({ queryKey: ["properties"], queryFn: async () => { const { data, error } = await supabase.from("properties").select("*").order("created_at", { ascending: false }); if (error) throw error; return data; } });
  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError("");
    if (!access.data?.agencyId) { setError("Your account is not linked to an agency."); return; }
    setBusy(true);
    const result = await supabase.from("properties").insert({ agency_id: access.data.agencyId, created_by: access.data.userId, title: title.trim(), city: city.trim() || null, price_pkr: price ? Number(price) : null, property_type: type, purpose });
    setBusy(false);
    if (result.error) { setError(result.error.message); return; }
    setTitle(""); setCity(""); setPrice(""); setShowForm(false);
    await client.invalidateQueries({ queryKey: ["properties"] });
  }
  async function setStatus(id: string, status: Status) {
    const result = await supabase.from("properties").update({ status }).eq("id", id);
    if (result.error) setError(result.error.message); else await client.invalidateQueries({ queryKey: ["properties"] });
  }
  return <AppShell title="Properties" description="Maintain accurate, searchable inventory for your agency." actions={<button onClick={() => setShowForm(!showForm)} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"><Plus className="size-4" />{showForm ? "Cancel" : "Add property"}</button>}>
    {showForm ? <form onSubmit={add} className="surface-panel mb-6 grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
      <label className="space-y-1.5 text-sm font-medium">Title *<input required minLength={3} value={title} onChange={e => setTitle(e.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-input bg-background px-3 font-normal" placeholder="10 Marla house in DHA" /></label>
      <label className="space-y-1.5 text-sm font-medium">City<input value={city} onChange={e => setCity(e.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-input bg-background px-3 font-normal" placeholder="Lahore" /></label>
      <label className="space-y-1.5 text-sm font-medium">Type<select value={type} onChange={e => setType(e.target.value as PropertyType)} className="mt-1 block h-10 w-full rounded-lg border border-input bg-background px-3 font-normal">{types.map(t => <option key={t} value={t}>{t}</option>)}</select></label>
      <label className="space-y-1.5 text-sm font-medium">Purpose<select value={purpose} onChange={e => setPurpose(e.target.value as Purpose)} className="mt-1 block h-10 w-full rounded-lg border border-input bg-background px-3 font-normal"><option value="sale">Sale</option><option value="rent">Rent</option></select></label>
      <label className="space-y-1.5 text-sm font-medium">Price in PKR<input type="number" min="0" value={price} onChange={e => setPrice(e.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-input bg-background px-3 font-normal" /></label>
      {error ? <p role="alert" className="self-end text-sm text-destructive">{error}</p> : null}
      <div className="self-end"><button disabled={busy} className="h-10 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60">{busy ? "Saving…" : "Save property"}</button></div>
    </form> : null}
    <div className="surface-panel overflow-hidden">{list.isLoading ? <p className="p-8 text-center text-sm text-muted-foreground">Loading inventory…</p> : list.isError ? <p role="alert" className="p-8 text-center text-sm text-destructive">Could not load properties. Check database access.</p> : (list.data ?? []).length === 0 ? <div className="p-10 text-center"><Home className="mx-auto size-8 text-muted-foreground" /><h3 className="mt-3 font-semibold">No properties yet</h3><p className="mt-1 text-sm text-muted-foreground">Add your first property to build inventory.</p></div> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3">Property</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Price</th><th className="px-4 py-3">Status</th></tr></thead><tbody className="divide-y divide-border">{(list.data ?? []).map(p => <tr key={p.id}><td className="px-4 py-4"><p className="font-medium">{p.title}</p><p className="text-xs text-muted-foreground">{p.city || "City not set"}</p></td><td className="px-4 py-4 capitalize">{p.property_type} · {p.purpose}</td><td className="px-4 py-4">{p.price_pkr == null ? "—" : "PKR " + p.price_pkr.toLocaleString("en-PK")}</td><td className="px-4 py-4"><select aria-label="Property status" value={p.status} onChange={e => setStatus(p.id, e.target.value as Status)} className="h-9 rounded-md border border-input bg-background px-2 text-xs">{(["available", "reserved", "sold", "rented", "inactive"] as Status[]).map(s => <option key={s} value={s}>{s}</option>)}</select></td></tr>)}</tbody></table></div>}</div>
  </AppShell>;
}
