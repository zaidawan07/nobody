import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Home, Plus } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { EmptyState, StatusBadge } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchPropertiesPaged, fetchCoverMedia, fetchMediaUrl, fetchAssignableMembers, type PropertyPageParams } from "@/lib/queries";
import { formatPkr, formatArea, titleCase } from "@/lib/format";
import { useEffect } from "react";

export const Route = createFileRoute("/_authenticated/agency/properties/")({
  head: () => ({ meta: [{ title: "Properties — EstateOS" }] }),
  component: AgencyPropertiesPage,
});

const PAGE_SIZE = 15;

function AgencyPropertiesPage() {
  const { access } = Route.useRouteContext();
  const agencyId = access.agencyId!;
  const [q, setQ] = useState("");
  const debouncedQ = useDebounce(q, 350);
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [type, setType] = useState<string | undefined>(undefined);
  const [purpose, setPurpose] = useState<string | undefined>(undefined);
  const [city, setCity] = useState("");
  const [society, setSociety] = useState("");
  const [locality, setLocality] = useState("");
  const [assignedTo, setAssignedTo] = useState<string | undefined>(undefined);
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [areaMin, setAreaMin] = useState("");
  const [areaMax, setAreaMax] = useState("");
  const [bedsMin, setBedsMin] = useState("");
  const [bathsMin, setBathsMin] = useState("");
  const [page, setPage] = useState(1);
  const { data: members } = useQuery({ queryKey: ["assignable-members", agencyId], queryFn: () => fetchAssignableMembers(agencyId) });

  const params: PropertyPageParams = {
    agencyId,
    q: debouncedQ || undefined,
    status: status ? [status] : undefined,
    propertyType: type ? [type] : undefined,
    purpose: purpose ? [purpose] : undefined,
    city: city || undefined,
    society: society || undefined,
    locality: locality || undefined,
    assignedTo: assignedTo === "" ? undefined : assignedTo,
    priceMin: priceMin ? Number(priceMin) : undefined,
    priceMax: priceMax ? Number(priceMax) : undefined,
    areaMin: areaMin ? Number(areaMin) : undefined,
    areaMax: areaMax ? Number(areaMax) : undefined,
    bedroomsMin: bedsMin ? Number(bedsMin) : undefined,
    bathroomsMin: bathsMin ? Number(bathsMin) : undefined,
    page,
    pageSize: PAGE_SIZE,
  };

  const { data, isLoading } = useQuery({
    queryKey: ["properties-paged", JSON.stringify(params)],
    queryFn: () => fetchPropertiesPaged(params),
  });

  const propertyIds = data?.rows.map((r) => r.id) ?? [];
  const { data: covers } = useQuery({
    queryKey: ["covers", propertyIds.join(",")],
    queryFn: () => fetchCoverMedia(propertyIds),
    enabled: propertyIds.length > 0,
  });

  return (
    <AppShell
      title="Properties"
      description="Every listing in your agency's inventory."
      actions={
        <Button asChild size="sm">
          <Link to="/agency/properties/new">
            <Plus className="size-4" /> Add property
          </Link>
        </Button>
      }
    >
      <div className="surface-panel mb-4 flex flex-wrap items-center gap-2 p-3">
        <Input
          placeholder="Search title, reference code, city, society…"
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
          className="w-full sm:w-64"
        />
        <FilterSelect label="Status" value={status} onValue={(v) => { setStatus(v); setPage(1); }} items={["", "available", "reserved", "sold", "rented", "draft", "unavailable", "expired", "inactive"]} />
        <FilterSelect label="Type" value={type} onValue={(v) => { setType(v); setPage(1); }} items={["", "house", "apartment", "plot", "commercial", "office", "shop", "warehouse", "agricultural"]} />
        <FilterSelect label="Purpose" value={purpose} onValue={(v) => { setPurpose(v); setPage(1); }} items={["", "sale", "rent"]} />
        <Input placeholder="City" value={city} onChange={(e) => { setCity(e.target.value); setPage(1); }} className="w-32" />
        <Input placeholder="Society" value={society} onChange={(e) => { setSociety(e.target.value); setPage(1); }} className="w-32" />
        <Input placeholder="Locality" value={locality} onChange={(e) => { setLocality(e.target.value); setPage(1); }} className="w-32" />
        <select
          aria-label="Assigned to"
          value={assignedTo ?? ""}
          onChange={(e) => { setAssignedTo(e.target.value || undefined); setPage(1); }}
          className="rounded-md border border-border bg-background px-2 py-2 text-sm"
        >
          <option value="">All assigned to</option>
          {(members ?? []).map((m) => (
            <option key={m.id} value={m.id}>{m.full_name ?? "Unnamed"}</option>
          ))}
        </select>
        <Input placeholder="Min price" value={priceMin} onChange={(e) => { setPriceMin(e.target.value); setPage(1); }} className="w-28" />
        <Input placeholder="Max price" value={priceMax} onChange={(e) => { setPriceMax(e.target.value); setPage(1); }} className="w-28" />
        <Input placeholder="Min area" value={areaMin} onChange={(e) => { setAreaMin(e.target.value); setPage(1); }} className="w-24" />
        <Input placeholder="Max area" value={areaMax} onChange={(e) => { setAreaMax(e.target.value); setPage(1); }} className="w-24" />
        <FilterSelect label="Beds (min)" value={bedsMin} onValue={(v) => { setBedsMin(v ?? ""); setPage(1); }} items={["", "1", "2", "3", "4", "5", "6", "7"]} />
        <FilterSelect label="Baths (min)" value={bathsMin} onValue={(v) => { setBathsMin(v ?? ""); setPage(1); }} items={["", "1", "2", "3", "4", "5", "6"]} />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
        </div>
      ) : !data || data.rows.length === 0 ? (
        <EmptyState
          icon={Home}
          title={debouncedQ || status || type || purpose || city ? "No matches" : "No properties yet"}
          description={debouncedQ || status || type || purpose || city ? "Try clearing the filters." : "Add your first property to start building your inventory."}
          action={
            <Button asChild className="mt-2">
              <Link to="/agency/properties/new">
                <Plus className="size-4" /> Add your first property
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="space-y-2 sm:hidden">
            {data.rows.map((p) => (
              <PropertyCard key={p.id} property={p} coverMediaId={covers?.get(p.id)?.thumbnail_path ?? covers?.get(p.id)?.storage_path ?? null} />
            ))}
          </div>
          <div className="hidden surface-panel overflow-x-auto sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Property</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Area</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Assigned to</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {covers?.has(p.id) ? <CoverIcon propertyId={p.id} path={covers!.get(p.id)!.thumbnail_path ?? covers!.get(p.id)!.storage_path} /> : null}
                        <Link to="/agency/properties/$propertyId" params={{ propertyId: p.id }} className="block font-medium">
                          {p.title}
                        </Link>
                      </div>
                      <span className="ml-10 text-xs text-muted-foreground">{[p.city, titleCase(p.purpose)].filter(Boolean).join(" · ")}</span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{titleCase(p.property_type)}</TableCell>
                    <TableCell><StatusBadge status={p.status} /></TableCell>
                    <TableCell className="text-muted-foreground">{p.price_pkr ? formatPkr(Number(p.price_pkr)) : "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{formatArea(p.area_value, p.area_unit)}</TableCell>
                    <TableCell className="text-muted-foreground">{[p.city, p.society].filter(Boolean).join(" · ") || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{p.assignee_name ?? "Unassigned"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 flex items-center justify-between text-sm">
            <span>{data.total} propert{data.total === 1 ? "y" : "ies"}</span>
            <div className="flex gap-1">
              <Button variant="secondary" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Prev</Button>
              <span className="flex items-center px-2">{page}</span>
              <Button variant="secondary" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page * PAGE_SIZE >= data.total}>Next</Button>
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}

function FilterSelect({ label, value, onValue, items }: { label: string; value: string | undefined; onValue: (v: string | undefined) => void; items: string[] }) {
  return (
    <Select value={value ?? ""} onValueChange={(v) => onValue(v === "" ? undefined : v)}>
      <SelectTrigger className="w-32"><SelectValue placeholder={label} /></SelectTrigger>
      <SelectContent>
        {items.map((v) => <SelectItem key={v} value={v}>{v === "" ? `All ${label.toLowerCase()}s` : titleCase(v)}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function CoverIcon({ propertyId, path }: { propertyId: string; path: string | null | undefined }) {
  const { data: url } = useQuery({ queryKey: ["cover-icon", propertyId], queryFn: () => fetchMediaUrl(path!), enabled: !!path });
  return url ? <img loading="lazy" src={url} className="ml-0 size-10 rounded object-cover" alt="" /> : <span className="inline-block size-10 rounded bg-secondary" />;
}

function PropertyCard({ property, coverMediaId }: { property: { id: string; title: string; city: string | null; status: string; price_pkr: number | null; area_value: number | null; area_unit: string | null; assignee_name: string | null; property_type: string | null; purpose: string | null }; coverMediaId: string | null }) {
  const { data: url } = useQuery({ queryKey: ["cover-icon", property.id], queryFn: () => fetchMediaUrl(coverMediaId!), enabled: !!coverMediaId });
  return (
    <Link to="/agency/properties/$propertyId" params={{ propertyId: property.id }} className="surface-panel flex gap-3 p-3">
      <div className="h-20 w-24 shrink-0 overflow-hidden rounded-md bg-secondary">
        {url ? <img src={url} loading="lazy" className="size-full object-cover" alt="" /> : <span className="flex size-full items-center justify-center text-xs text-muted-foreground">No photo</span>}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{property.title}</p>
        <p className="text-xs text-muted-foreground">{[property.city, titleCase(property.status ?? ""), property.property_type ? titleCase(property.property_type ?? "") : null, property.purpose ? titleCase(property.purpose ?? "") : null].filter(Boolean).join(" · ")}</p>
        <p className="mt-1 text-sm">{property.price_pkr ? formatPkr(Number(property.price_pkr)) : "—"}</p>
        <p className="text-xs text-muted-foreground">{formatArea(property.area_value, property.area_unit)}</p>
        <p className="text-xs text-muted-foreground">Assigned to: {property.assignee_name ?? "Unassigned"}</p>
      </div>
    </Link>
  );
}

function useDebounce<T>(v: T, ms: number): T {
  const [out, setOut] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setOut(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return out;
}
