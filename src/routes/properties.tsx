import { useMemo, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Home, Pencil, Plus, Search } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/useAccess";
import type { Database } from "@/integrations/supabase/types";

type PropertyType = Database["public"]["Enums"]["property_type"];
type Purpose = Database["public"]["Enums"]["property_purpose"];
type Status = Database["public"]["Enums"]["property_status"];
type PropertyRow = Database["public"]["Tables"]["properties"]["Row"];

export const Route = createFileRoute("/properties")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
  },
  head: () => ({ meta: [{ title: "Properties — EstateOS" }] }),
  component: PropertiesPage,
});

const types: PropertyType[] = [
  "house",
  "apartment",
  "plot",
  "commercial",
  "office",
  "shop",
  "warehouse",
  "agricultural",
];
const statuses: Status[] = ["available", "reserved", "sold", "rented", "inactive"];

function PropertiesPage() {
  const access = useAccess();
  const client = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [title, setTitle] = useState("");
  const [city, setCity] = useState("");
  const [price, setPrice] = useState("");
  const [type, setType] = useState<PropertyType>("house");
  const [purpose, setPurpose] = useState<Purpose>("sale");

  const list = useQuery({
    queryKey: ["properties", access.data?.agencyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filteredProperties = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return (list.data ?? []).filter((property) => {
      const matchesSearch =
        !query ||
        [property.title, property.city, property.society, property.locality, property.reference_code]
          .some((value) => value?.toLocaleLowerCase().includes(query)) ||
        property.property_type.includes(query) ||
        property.purpose.includes(query);
      return matchesSearch && (statusFilter === "all" || property.status === statusFilter);
    });
  }, [list.data, search, statusFilter]);

  function resetForm() {
    setEditingId(null);
    setTitle("");
    setCity("");
    setPrice("");
    setType("house");
    setPurpose("sale");
    setError("");
  }

  function startEditing(property: PropertyRow) {
    setEditingId(property.id);
    setTitle(property.title);
    setCity(property.city ?? "");
    setPrice(property.price_pkr == null ? "" : String(property.price_pkr));
    setType(property.property_type);
    setPurpose(property.purpose);
    setError("");
    setShowForm(true);
  }

  async function saveProperty(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!access.data?.agencyId) {
      setError("Your account is not linked to an agency.");
      return;
    }

    const parsedPrice = price.trim() ? Number(price) : null;
    if (parsedPrice !== null && (!Number.isFinite(parsedPrice) || parsedPrice < 0)) {
      setError("Enter a valid non-negative price.");
      return;
    }

    setBusy(true);
    try {
      const values = {
        title: title.trim(),
        city: city.trim() || null,
        price_pkr: parsedPrice,
        property_type: type,
        purpose,
      };
      const result = editingId
        ? await supabase.from("properties").update(values).eq("id", editingId)
        : await supabase.from("properties").insert({
            ...values,
            agency_id: access.data.agencyId,
            created_by: access.data.userId,
          });

      if (result.error) throw result.error;
      resetForm();
      setShowForm(false);
      await client.invalidateQueries({ queryKey: ["properties"] });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the property.");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(id: string, status: Status) {
    setError("");
    const result = await supabase.from("properties").update({ status }).eq("id", id);
    if (result.error) setError(result.error.message);
    else await client.invalidateQueries({ queryKey: ["properties"] });
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
      title="Properties"
      description="Maintain accurate, searchable inventory for your agency."
      actions={
        <button
          onClick={toggleForm}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
        >
          <Plus className="size-4" />
          {showForm ? "Cancel" : "Add property"}
        </button>
      }
    >
      {showForm ? (
        <form onSubmit={saveProperty} className="surface-panel mb-6 grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-1.5 text-sm font-medium">
            Title *
            <input
              required
              minLength={3}
              maxLength={180}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="mt-1 block h-10 w-full rounded-lg border border-input bg-background px-3 font-normal"
              placeholder="10 Marla house in DHA"
            />
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            City
            <input
              maxLength={100}
              value={city}
              onChange={(event) => setCity(event.target.value)}
              className="mt-1 block h-10 w-full rounded-lg border border-input bg-background px-3 font-normal"
              placeholder="Lahore"
            />
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Type
            <select
              value={type}
              onChange={(event) => setType(event.target.value as PropertyType)}
              className="mt-1 block h-10 w-full rounded-lg border border-input bg-background px-3 font-normal"
            >
              {types.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Purpose
            <select
              value={purpose}
              onChange={(event) => setPurpose(event.target.value as Purpose)}
              className="mt-1 block h-10 w-full rounded-lg border border-input bg-background px-3 font-normal"
            >
              <option value="sale">Sale</option>
              <option value="rent">Rent</option>
            </select>
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Price in PKR
            <input
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              className="mt-1 block h-10 w-full rounded-lg border border-input bg-background px-3 font-normal"
            />
          </label>
          {error ? <p role="alert" className="self-end text-sm text-destructive">{error}</p> : null}
          <div className="flex items-center gap-2 self-end">
            <button
              type="submit"
              disabled={busy}
              className="h-10 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {busy ? "Saving…" : editingId ? "Save changes" : "Save property"}
            </button>
            {editingId ? (
              <button type="button" onClick={toggleForm} className="h-10 rounded-lg border border-input px-4 text-sm">
                Cancel edit
              </button>
            ) : null}
          </div>
        </form>
      ) : null}

      {error && !showForm ? <p role="alert" className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}

      <div className="surface-panel mb-4 flex flex-col gap-3 p-3 sm:flex-row">
        <label className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            aria-label="Search properties"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search title, city, society, locality, or reference…"
            className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm"
          />
        </label>
        <select
          aria-label="Filter properties by status"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as Status | "all")}
          className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
        >
          <option value="all">All statuses</option>
          {statuses.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>

      <div className="surface-panel overflow-hidden">
        {list.isLoading ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Loading inventory…</p>
        ) : list.isError ? (
          <p role="alert" className="p-8 text-center text-sm text-destructive">Could not load properties. Check database access.</p>
        ) : (list.data ?? []).length === 0 ? (
          <div className="p-10 text-center">
            <Home className="mx-auto size-8 text-muted-foreground" />
            <h3 className="mt-3 font-semibold">No properties yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">Add your first property to build inventory.</p>
          </div>
        ) : filteredProperties.length === 0 ? (
          <div className="p-10 text-center">
            <Search className="mx-auto size-8 text-muted-foreground" />
            <h3 className="mt-3 font-semibold">No matching properties</h3>
            <p className="mt-1 text-sm text-muted-foreground">Try another search or clear the status filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Property</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Price</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredProperties.map((property) => (
                  <tr key={property.id}>
                    <td className="px-4 py-4">
                      <p className="font-medium">{property.title}</p>
                      <p className="text-xs text-muted-foreground">{property.city || "City not set"}</p>
                    </td>
                    <td className="px-4 py-4 capitalize">{property.property_type} · {property.purpose}</td>
                    <td className="px-4 py-4">
                      {property.price_pkr == null ? "—" : "PKR " + property.price_pkr.toLocaleString("en-PK")}
                    </td>
                    <td className="px-4 py-4">
                      <select
                        aria-label={`Status for ${property.title}`}
                        value={property.status}
                        onChange={(event) => setStatus(property.id, event.target.value as Status)}
                        className="h-9 rounded-md border border-input bg-background px-2 text-xs"
                      >
                        {statuses.map((item) => <option key={item} value={item}>{item}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-4">
                      <button
                        onClick={() => startEditing(property)}
                        className="inline-flex h-9 items-center gap-2 rounded-md border border-input px-3 text-xs font-medium"
                      >
                        <Pencil className="size-3.5" /> Edit
                      </button>
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
