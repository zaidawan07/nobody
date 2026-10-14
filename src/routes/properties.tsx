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
type AreaUnit = Database["public"]["Enums"]["area_unit"];
type PropertyRow = Database["public"]["Tables"]["properties"]["Row"];
type PropertyMediaView = { id: string; agency_id: string; property_id: string; storage_path: string; caption: string | null; sort_order: number; signedUrl: string | null };

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
const areaUnits: AreaUnit[] = ["marla", "kanal", "sqft", "sqyd", "acre"];

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
  const [society, setSociety] = useState("");
  const [locality, setLocality] = useState("");
  const [phaseBlock, setPhaseBlock] = useState("");
  const [address, setAddress] = useState("");
  const [referenceCode, setReferenceCode] = useState("");
  const [description, setDescription] = useState("");
  const [areaValue, setAreaValue] = useState("");
  const [areaUnit, setAreaUnit] = useState<AreaUnit>("marla");
  const [bedrooms, setBedrooms] = useState("");
  const [bathrooms, setBathrooms] = useState("");
  const [furnished, setFurnished] = useState(false);
  const [featuresText, setFeaturesText] = useState("");
  const [price, setPrice] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [mediaActionId, setMediaActionId] = useState<string | null>(null);
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

  const media = useQuery({
    queryKey: ["property-media", access.data?.agencyId],
    enabled: !!access.data,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("property_media")
        .select("id,agency_id,property_id,storage_path,caption,sort_order")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return Promise.all((data ?? []).map(async (item) => {
        const { data: signed } = await supabase.storage.from("property-media").createSignedUrl(item.storage_path, 3600);
        return { ...item, signedUrl: signed?.signedUrl ?? null };
      }));
    },
  });

  const mediaByProperty = useMemo(() => {
    const grouped = new Map<string, { count: number; thumbnail: string | null; nextSortOrder: number }>();
    for (const item of media.data ?? []) {
      const existing = grouped.get(item.property_id) ?? { count: 0, thumbnail: null, nextSortOrder: 0 };
      existing.count += 1;
      existing.thumbnail ??= item.signedUrl;
      existing.nextSortOrder = Math.max(existing.nextSortOrder, item.sort_order + 1);
      grouped.set(item.property_id, existing);
    }
    return grouped;
  }, [media.data]);

  const filteredProperties = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return (list.data ?? []).filter((property) => {
      const matchesSearch =
        !query ||
        [property.title, property.city, property.society, property.locality, property.phase_block, property.address, property.reference_code, property.description]
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
    setSociety("");
    setLocality("");
    setPhaseBlock("");
    setAddress("");
    setReferenceCode("");
    setDescription("");
    setAreaValue("");
    setAreaUnit("marla");
    setBedrooms("");
    setBathrooms("");
    setFurnished(false);
    setFeaturesText("");
    setPrice("");
    setPhotos([]);
    setMediaActionId(null);
    setType("house");
    setPurpose("sale");
    setError("");
  }

  function startEditing(property: PropertyRow) {
    setEditingId(property.id);
    setTitle(property.title);
    setCity(property.city ?? "");
    setSociety(property.society ?? "");
    setLocality(property.locality ?? "");
    setPhaseBlock(property.phase_block ?? "");
    setAddress(property.address ?? "");
    setReferenceCode(property.reference_code ?? "");
    setDescription(property.description ?? "");
    setAreaValue(property.area_value == null ? "" : String(property.area_value));
    setAreaUnit(property.area_unit ?? "marla");
    setBedrooms(property.bedrooms == null ? "" : String(property.bedrooms));
    setBathrooms(property.bathrooms == null ? "" : String(property.bathrooms));
    setFurnished(property.furnished);
    setFeaturesText((property.features ?? []).join(", "));
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
    const parsedArea = areaValue.trim() ? Number(areaValue) : null;
    const parsedBedrooms = bedrooms.trim() ? Number(bedrooms) : null;
    const parsedBathrooms = bathrooms.trim() ? Number(bathrooms) : null;
    if (parsedPrice !== null && (!Number.isFinite(parsedPrice) || parsedPrice < 0)) {
      setError("Enter a valid non-negative price.");
      return;
    }
    if (parsedArea !== null && (!Number.isFinite(parsedArea) || parsedArea < 0)) {
      setError("Enter a valid non-negative area.");
      return;
    }
    if ([parsedBedrooms, parsedBathrooms].some((value) => value !== null && (!Number.isInteger(value) || value < 0))) {
      setError("Bedrooms and bathrooms must be whole numbers greater than or equal to zero.");
      return;
    }

    if (photos.some((file) => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024)) {
      setError("Photos must be JPG, PNG, or WebP files no larger than 10 MB each.");
      return;
    }
    if (photos.length > 8) {
      setError("Upload up to 8 photos per save.");
      return;
    }

    setBusy(true);
    let savedPropertyId: string | null = null;
    try {
      const values = {
        title: title.trim(),
        city: city.trim() || null,
        society: society.trim() || null,
        locality: locality.trim() || null,
        phase_block: phaseBlock.trim() || null,
        address: address.trim() || null,
        reference_code: referenceCode.trim() || null,
        description: description.trim() || null,
        area_value: parsedArea,
        area_unit: parsedArea === null ? null : areaUnit,
        bedrooms: parsedBedrooms,
        bathrooms: parsedBathrooms,
        furnished,
        features: featuresText.split(",").map((feature) => feature.trim()).filter(Boolean).slice(0, 30),
        price_pkr: parsedPrice,
        property_type: type,
        purpose,
      };
      if (editingId) {
        const result = await supabase.from("properties").update(values).eq("id", editingId).select("id").single();
        if (result.error) throw result.error;
        savedPropertyId = result.data.id;
      } else {
        const result = await supabase.from("properties").insert({
          ...values,
          agency_id: access.data.agencyId,
          created_by: access.data.userId,
        }).select("id").single();
        if (result.error) throw result.error;
        savedPropertyId = result.data.id;
      }

      for (const [index, file] of photos.entries()) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100) || "photo";
        const storagePath = `${access.data.agencyId}/${savedPropertyId}/${crypto.randomUUID()}-${safeName}`;
        const { error: uploadError } = await supabase.storage.from("property-media").upload(storagePath, file, {
          contentType: file.type,
          cacheControl: "3600",
          upsert: false,
        });
        if (uploadError) throw new Error("Property saved, but a photo could not be uploaded. Verify the property-media storage migration and permissions.");
        const { error: mediaError } = await supabase.from("property_media").insert({
          agency_id: access.data.agencyId,
          property_id: savedPropertyId,
          kind: "photo",
          storage_path: storagePath,
          sort_order: (mediaByProperty.get(savedPropertyId)?.nextSortOrder ?? 0) + index,
        });
        if (mediaError) {
          setError("Property saved, but a photo record could not be saved. Contact the administrator before retrying that photo.");
          throw mediaError;
        }
      }

      resetForm();
      setShowForm(false);
      await Promise.all([
        client.invalidateQueries({ queryKey: ["properties"] }),
        client.invalidateQueries({ queryKey: ["property-media"] }),
      ]);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the property.");
      if (savedPropertyId) {
        await Promise.all([
          client.invalidateQueries({ queryKey: ["properties"] }),
          client.invalidateQueries({ queryKey: ["property-media"] }),
        ]);
      }
    } finally {
      setBusy(false);
    }
  }

  async function deletePhoto(item: PropertyMediaView) {
    if (!access.data?.agencyId || access.data.role !== "agency_admin") {
      setError("Only agency administrators can delete property photos.");
      return;
    }
    setMediaActionId(item.id);
    setError("");
    try {
      const { error: rowError } = await supabase.from("property_media")
        .delete().eq("id", item.id).eq("agency_id", access.data.agencyId);
      if (rowError) throw rowError;
      const { error: storageError } = await supabase.storage.from("property-media").remove([item.storage_path]);
      await client.invalidateQueries({ queryKey: ["property-media"] });
      if (storageError) setError("The photo was removed from the listing, but its stored file could not be cleaned up. Ask an administrator to review storage.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove the photo.");
    } finally {
      setMediaActionId(null);
    }
  }

  async function replacePhoto(item: PropertyMediaView, file: File) {
    if (!access.data?.agencyId || access.data.role !== "agency_admin") {
      setError("Only agency administrators can replace property photos.");
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024) {
      setError("Replacement photos must be JPG, PNG, or WebP files no larger than 10 MB.");
      return;
    }
    setMediaActionId(item.id);
    setError("");
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100) || "photo";
    const newPath = `${access.data.agencyId}/${item.property_id}/${crypto.randomUUID()}-${safeName}`;
    try {
      const { error: uploadError } = await supabase.storage.from("property-media").upload(newPath, file, {
        contentType: file.type,
        cacheControl: "3600",
        upsert: false,
      });
      if (uploadError) throw uploadError;
      const { error: updateError } = await supabase.from("property_media")
        .update({ storage_path: newPath })
        .eq("id", item.id)
        .eq("agency_id", access.data.agencyId);
      if (updateError) {
        await supabase.storage.from("property-media").remove([newPath]);
        throw updateError;
      }
      const { error: cleanupError } = await supabase.storage.from("property-media").remove([item.storage_path]);
      await client.invalidateQueries({ queryKey: ["property-media"] });
      if (cleanupError) setError("The replacement is active, but the previous stored file could not be cleaned up.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not replace the photo.");
    } finally {
      setMediaActionId(null);
    }
  }

  async function movePhoto(item: PropertyMediaView, direction: "up" | "down") {
    setMediaActionId(item.id);
    setError("");
    try {
      const { error: reorderError } = await supabase.rpc("reorder_property_media", {
        _media_id: item.id,
        _direction: direction,
      });
      if (reorderError) throw reorderError;
      await client.invalidateQueries({ queryKey: ["property-media"] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not reorder the photos.");
    } finally {
      setMediaActionId(null);
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
            Society / project
            <input maxLength={120} value={society} onChange={(event) => setSociety(event.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-input bg-background px-3 font-normal" placeholder="DHA, Bahria Town…" />
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Locality
            <input maxLength={120} value={locality} onChange={(event) => setLocality(event.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-input bg-background px-3 font-normal" placeholder="Sector, neighborhood…" />
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Phase / block
            <input maxLength={80} value={phaseBlock} onChange={(event) => setPhaseBlock(event.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-input bg-background px-3 font-normal" placeholder="Phase 6, Block B…" />
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Reference code
            <input maxLength={80} value={referenceCode} onChange={(event) => setReferenceCode(event.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-input bg-background px-3 font-normal" placeholder="Internal listing ID" />
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Street / address
            <input maxLength={240} value={address} onChange={(event) => setAddress(event.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-input bg-background px-3 font-normal" placeholder="Street, building, or plot address" />
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Area
            <div className="mt-1 flex gap-2">
              <input type="number" min="0" step="0.01" value={areaValue} onChange={(event) => setAreaValue(event.target.value)} className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 font-normal" placeholder="Area" />
              <select value={areaUnit} onChange={(event) => setAreaUnit(event.target.value as AreaUnit)} className="h-10 rounded-lg border border-input bg-background px-2 font-normal">
                {areaUnits.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
              </select>
            </div>
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Bedrooms
            <input type="number" min="0" step="1" value={bedrooms} onChange={(event) => setBedrooms(event.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-input bg-background px-3 font-normal" />
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Bathrooms
            <input type="number" min="0" step="1" value={bathrooms} onChange={(event) => setBathrooms(event.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-input bg-background px-3 font-normal" />
          </label>
          <label className="flex items-center gap-2 self-end text-sm font-medium">
            <input type="checkbox" checked={furnished} onChange={(event) => setFurnished(event.target.checked)} className="size-4 rounded border-input" />
            Furnished
          </label>
          <label className="space-y-1.5 text-sm font-medium md:col-span-2 xl:col-span-3">
            Description
            <textarea maxLength={5000} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1 block w-full rounded-lg border border-input bg-background px-3 py-2 font-normal" placeholder="Property details, condition, nearby facilities…" />
          </label>
          <label className="space-y-1.5 text-sm font-medium md:col-span-2 xl:col-span-3">
            Features (comma-separated)
            <input maxLength={2000} value={featuresText} onChange={(event) => setFeaturesText(event.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-input bg-background px-3 font-normal" placeholder="Parking, lift, backup power, garden…" />
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
            Property photos (JPG, PNG, WebP; max 10 MB each)
            <input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={(event) => setPhotos(Array.from(event.target.files ?? []).slice(0, 8))} className="mt-1 block w-full text-xs font-normal file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-2" />
            {photos.length ? <span className="block text-xs text-muted-foreground">{photos.length} photo(s) selected</span> : null}
          </label>
          {editingId ? (
            <div className="space-y-3 md:col-span-2 xl:col-span-4">
              <div><h3 className="text-sm font-semibold">Existing photos</h3><p className="mt-1 text-xs text-muted-foreground">Move photos to change their display order. Replace or remove requires an agency administrator.</p></div>
              {(media.data ?? []).filter((item) => item.property_id === editingId).length === 0 ? (
                <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">No saved photos for this property yet.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {(media.data ?? []).filter((item) => item.property_id === editingId).map((item, index, items) => (
                    <div key={item.id} className="rounded-lg border border-border p-3">
                      {item.signedUrl ? <img src={item.signedUrl} alt={item.caption || "Property photo"} loading="lazy" className="h-32 w-full rounded-md object-cover" /> : <div className="flex h-32 items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">Preview unavailable</div>}
                      <p className="mt-2 truncate text-xs text-muted-foreground">Photo {index + 1} of {items.length}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button type="button" disabled={!!mediaActionId || index === 0} onClick={() => void movePhoto(item, "up")} className="rounded-md border border-input px-2 py-1 text-xs disabled:opacity-40">Move up</button>
                        <button type="button" disabled={!!mediaActionId || index === items.length - 1} onClick={() => void movePhoto(item, "down")} className="rounded-md border border-input px-2 py-1 text-xs disabled:opacity-40">Move down</button>
                        {access.data?.role === "agency_admin" ? (
                          <>
                            <label className="cursor-pointer rounded-md border border-input px-2 py-1 text-xs">Replace
                              <input type="file" accept="image/jpeg,image/png,image/webp" disabled={!!mediaActionId} className="sr-only" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void replacePhoto(item as PropertyMediaView, file); }} />
                            </label>
                            <button type="button" disabled={!!mediaActionId} onClick={() => void deletePhoto(item as PropertyMediaView)} className="rounded-md border border-destructive/40 px-2 py-1 text-xs text-destructive disabled:opacity-40">{mediaActionId === item.id ? "Saving…" : "Remove"}</button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
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
                  <th className="px-4 py-3">Photo</th><th className="px-4 py-3">Property</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Price</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Photos</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredProperties.map((property) => (
                  <tr key={property.id}>
                    <td className="px-4 py-4">
                      {mediaByProperty.get(property.id)?.thumbnail ? <img src={mediaByProperty.get(property.id)?.thumbnail ?? ""} alt="" loading="lazy" className="size-12 rounded-md object-cover" /> : <span className="flex size-12 items-center justify-center rounded-md bg-muted"><Home className="size-5 text-muted-foreground" /></span>}
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-medium">{property.title}</p>
                      <p className="text-xs text-muted-foreground">{[property.city, property.society, property.locality, property.phase_block].filter(Boolean).join(" · ") || "Location not set"}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">{[property.area_value != null ? `${property.area_value} ${property.area_unit ?? ""}`.trim() : "", property.bedrooms != null ? `${property.bedrooms} bed` : "", property.bathrooms != null ? `${property.bathrooms} bath` : "", property.furnished ? "Furnished" : ""].filter(Boolean).join(" · ")}</p>
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
                    <td className="px-4 py-4 text-xs text-muted-foreground">{mediaByProperty.get(property.id)?.count ?? 0}</td>
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
