import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Loader2, AlertCircle, ChevronRight, MapPin, WalletCards, Ruler } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { createProperty, fetchAssignableMembers } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { parsePkrAmount } from "@/lib/pkr-parser";
import { titleCase } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/agency/properties/new")({
  head: () => ({ meta: [{ title: "Add property — EstateOS" }] }),
  component: NewPropertyPage,
});

const AMENITY_OPTIONS = [
  "Electricity", "Gas", "Water", "Solar", "Backup generator", "Petrol pump", "Lift",
  "Covered parking", "Corner plot", "File", "Direct street access", "Security staff",
  "Boundary wall", "Backyard", "Dining room", "Powder room", "Drawing room", "Terrace", "Store room",
];

const PROPERTY_TYPES = [
  { value: "house", label: "House" },
  { value: "apartment", label: "Apartment / Flat" },
  { value: "plot", label: "Plot" },
  { value: "commercial", label: "Commercial" },
  { value: "office", label: "Office" },
  { value: "shop", label: "Shop" },
  { value: "warehouse", label: "Warehouse" },
  { value: "agricultural", label: "Agricultural Land" },
];

const schema = z.object({
  title: z.string().min(2, "Enter a title"),
  referenceCode: z.string().optional(),
  propertyType: z.string(),
  purpose: z.enum(["sale", "rent"]),
  status: z.string(),
  description: z.string().optional(),
  province: z.string().optional(),
  division: z.string().optional(),
  district: z.string().optional(),
  city: z.string().optional(),
  tehsil: z.string().optional(),
  locality: z.string().optional(),
  society: z.string().optional(),
  phaseBlock: z.string().optional(),
  block: z.string().optional(),
  address: z.string().optional(),
  priceText: z.string().optional(),
  rentPeriod: z.string().optional(),
  areaValue: z.string().optional(),
  areaUnit: z.string().optional(),
  bedrooms: z.string().optional(),
  bathrooms: z.string().optional(),
  furnished: z.boolean().optional(),
  amenities: z.array(z.string()),
  customFeatures: z.string().optional(),
  assignedTo: z.string().optional(),
  ownerName: z.string().optional(),
  ownerPhone: z.string().optional(),
  tenantName: z.string().optional(),
  tenantPhone: z.string().optional(),
  realtorName: z.string().optional(),
  realtorPhone: z.string().optional(),
});

type Values = z.infer<typeof schema>;

const STEPS = ["Basic info", "Location", "Price & area", "Features", "Assign + contacts", "Review"];

interface LocationRow { id: string; name: string; kind: string; parent_id: string | null; }

function useLocations() {
  return useQuery({
    queryKey: ["locations-all"],
    queryFn: async (): Promise<LocationRow[]> => {
      const { data } = await supabase.from("locations").select("id,name,kind,parent_id");
      return (data ?? []) as LocationRow[];
    },
    staleTime: 3600_000,
  });
}

function NewPropertyPage() {
  const { access } = Route.useRouteContext();
  const agencyId = access.agencyId!;
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const [saveAs, setSaveAs] = useState<"draft" | "publish">("draft");
  const { data: members } = useQuery({ queryKey: ["assignable-members", agencyId], queryFn: () => fetchAssignableMembers(agencyId) });
  const { data: locations } = useLocations();

  const byName = useMemo(() => {
    const m = new Map<string, LocationRow>();
    for (const r of locations ?? []) m.set(`${r.kind}:${r.parent_id ?? ""}:${r.name}`, r);
    return m;
  }, [locations]);

  const locationIndex = useMemo(() => {
    const idx: Record<string, LocationRow[]> = {};
    for (const r of locations ?? []) {
      const key = `${r.kind}::${r.parent_id ?? ""}`;
      if (!idx[key]) idx[key] = [];
      idx[key]!.push(r);
    }
    return idx;
  }, [locations]);

  function rowsUnder(kind: string, parentName: string, parentKind: string): LocationRow[] {
    const parent = locations?.find((r) => r.name === parentName && r.kind === parentKind);
    if (!parent) return [];
    return (locationIndex[`${kind}::${parent.id}`] ?? []).sort((a, b) => a.name.localeCompare(b.name));
  }

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "", referenceCode: "", propertyType: "house", purpose: "sale", status: "available",
      description: "", province: "", division: "", district: "", city: "", tehsil: "", locality: "",
      society: "", phaseBlock: "", block: "", address: "", priceText: "", rentPeriod: "", areaValue: "",
      areaUnit: "marla", bedrooms: "", bathrooms: "", furnished: false, amenities: [], customFeatures: "",
      assignedTo: access.userId, ownerName: "", ownerPhone: "", tenantName: "", tenantPhone: "",
      realtorName: "", realtorPhone: "",
    },
  });

  const province = form.watch("province");
  const division = form.watch("division");
  const district = form.watch("district");
  const city = form.watch("city");
  const purpose = form.watch("purpose");

  const provinceRows = locations?.filter((r) => r.kind === "province").sort((a, b) => a.name.localeCompare(b.name)) ?? [];
  const divisionRows = province ? rowsUnder("division", province, "province") : [];
  const districtRows = districtRowsForProvince();
  const cityRows = district ? rowsUnder("city", district, "district") : [];
  const tehsilRows = city ? rowsUnder("tehsil", city, "city") : [];
  void provinceRows;
  void byName;

  function districtRowsForProvince(): LocationRow[] {
    const divs = divisionRows;
    const out: LocationRow[] = [];
    for (const d of divs) {
      for (const r of locations ?? []) if (r.kind === "district" && r.parent_id === d.id) out.push(r);
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  async function onSubmit(values: Values) {
    setFormError(null);
    const parsed = values.priceText ? parsePkrAmount(values.priceText) : null;
    if (values.priceText && parsed === null) {
      setFormError('Couldn\'t read that price. Try "50 lakh", "1.5 crore", "80,000" or "80,000/month".');
      setStep(2);
      return;
    }
    if (parsed !== null && parsed < 0) {
      setFormError("Price can't be negative.");
      setStep(2);
      return;
    }
    if (values.purpose === "rent" && !values.rentPeriod) {
      setFormError("Add a rental period for rent listings.");
      setStep(2);
      return;
    }
    try {
      const { id } = await createProperty({
        agencyId, createdBy: access.userId, assignedTo: values.assignedTo || undefined,
        title: values.title, referenceCode: values.referenceCode || undefined,
        propertyType: values.propertyType as never, purpose: values.purpose,
        status: saveAs === "draft" ? "draft" : (values.status as never),
        description: values.description || undefined,
        province: values.province || undefined, division: values.division || undefined,
        district: values.district || undefined, tehsil: values.tehsil || undefined,
        city: values.city || undefined, locality: values.locality || undefined,
        society: values.society || undefined, phaseBlock: values.phaseBlock || undefined,
        block: values.block || undefined,
        pricePkr: parsed ?? undefined,
        rentPeriod: values.purpose === "rent" ? (values.rentPeriod as never) : undefined,
        areaValue: values.areaValue ? Number(values.areaValue) : undefined,
        areaUnit: (values.areaUnit as never) ?? null,
        bedrooms: values.bedrooms ? Number(values.bedrooms) : undefined,
        bathrooms: values.bathrooms ? Number(values.bathrooms) : undefined,
        furnished: values.furnished ?? false,
        features: [...values.amenities, ...(values.customFeatures ? values.customFeatures.split(",").map((s) => s.trim()).filter(Boolean) : [])],
        ownerName: values.ownerName || undefined, ownerPhone: values.ownerPhone || undefined,
        tenantName: values.tenantName || undefined, tenantPhone: values.tenantPhone || undefined,
        realtorName: values.realtorName || undefined, realtorPhone: values.realtorPhone || undefined,
      });
      toast.success(saveAs === "draft" ? "Draft saved" : "Property published");
      navigate({ to: "/agency/properties/$propertyId", params: { propertyId: id } });
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Couldn't save that property.");
    }
  }

  return (
    <AppShell
      title="Add property"
      actions={<Button asChild variant="ghost" size="sm"><Link to="/agency/properties"><ArrowLeft className="size-4" /> Back</Link></Button>}
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="mx-auto w-full max-w-2xl">
          <div className="mb-4 flex gap-1 overflow-x-auto">
            {STEPS.map((s, i) => (
              <button type="button" key={s}
                className={`flex-1 whitespace-nowrap rounded-full py-1.5 text-[11px] ${i === step ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}
                onClick={() => i < step && setStep(i)}>{i + 1}. {s.split(" ")[0]}</button>
            ))}
          </div>

          {formError ? (<Alert variant="destructive" className="mb-4"><AlertCircle className="size-4" /><AlertDescription>{formError}</AlertDescription></Alert>) : null}

          {step === 0 && (
            <section className="surface-panel space-y-4 p-5">
              <h2 className="text-base font-semibold">Basic information</h2>
              <FormField control={form.control} name="title" render={({ field }) => (
                <FormItem><FormLabel>Title</FormLabel><FormControl><Input placeholder="3-bed house in DHA Phase 6" {...field} /></FormControl><FormMessage /></FormItem>)} />
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="propertyType" render={({ field }) => (
                  <FormItem><FormLabel>Property type</FormLabel><Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent>
                    {PROPERTY_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="purpose" render={({ field }) => (
                  <FormItem><FormLabel>Purpose</FormLabel><Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent>
                    <SelectItem value="sale">Sale</SelectItem><SelectItem value="rent">Rent</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
              </div>
              <FormField control={form.control} name="referenceCode" render={({ field }) => (
                <FormItem><FormLabel>Reference code (optional)</FormLabel><FormControl><Input placeholder="e.g. LAH-2026-014" {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea rows={4} placeholder="Tell buyers/renters about the property…" {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="status" render={({ field }) => (
                <FormItem><FormLabel>Status</FormLabel><Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent>
                  <SelectItem value="available">Available</SelectItem><SelectItem value="reserved">Reserved</SelectItem>
                  <SelectItem value="sold">Sold</SelectItem><SelectItem value="rented">Rented</SelectItem>
                  <SelectItem value="unavailable">Unavailable</SelectItem><SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
            </section>
          )}

          {step === 1 && (
            <section className="surface-panel space-y-4 p-5">
              <h2 className="text-base font-semibold"><MapPin className="mr-1 inline size-4" />Location</h2>
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="province" render={({ field }) => (
                  <FormItem><FormLabel>Province</FormLabel><Select value={field.value ?? ""} onValueChange={(v) => { field.onChange(v); form.setValue("division", ""); form.setValue("district", ""); form.setValue("city", ""); form.setValue("tehsil", ""); }}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger></FormControl>
                    <SelectContent>{provinceRows.map((r) => <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="division" render={({ field }) => (
                  <FormItem><FormLabel>Division</FormLabel><Select value={field.value ?? ""} onValueChange={(v) => { field.onChange(v); form.setValue("district", ""); form.setValue("city", ""); form.setValue("tehsil", ""); }}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger></FormControl>
                    <SelectContent>{divisionRows.map((r) => <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="district" render={({ field }) => (
                  <FormItem><FormLabel>District</FormLabel><Select value={field.value ?? ""} onValueChange={(v) => { field.onChange(v); form.setValue("city", ""); form.setValue("tehsil", ""); }}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger></FormControl>
                    <SelectContent>{districtRows.map((r) => <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="city" render={({ field }) => (
                  <FormItem><FormLabel>City</FormLabel><Select value={field.value ?? ""} onValueChange={(v) => { field.onChange(v); form.setValue("tehsil", ""); }}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger></FormControl>
                    <SelectContent>{cityRows.map((r) => <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="tehsil" render={({ field }) => (
                  <FormItem><FormLabel>Tehsil (optional)</FormLabel><Select value={field.value ?? ""} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select (optional)" /></SelectTrigger></FormControl>
                    <SelectContent>{tehsilRows.map((r) => <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="locality" render={({ field }) => (
                  <FormItem><FormLabel>Locality / area</FormLabel><FormControl><Input placeholder="e.g. Gulberg II" {...field} /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="society" render={({ field }) => (
                  <FormItem><FormLabel>Society</FormLabel><FormControl><Input placeholder="e.g. DHA, Bahria Town" {...field} /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="phaseBlock" render={({ field }) => (
                  <FormItem><FormLabel>Phase</FormLabel><FormControl><Input placeholder="e.g. Phase 6" {...field} /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="block" render={({ field }) => (
                  <FormItem><FormLabel>Block</FormLabel><FormControl><Input placeholder="e.g. Block C" {...field} /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="address" render={({ field }) => (
                  <FormItem><FormLabel>Street address</FormLabel><FormControl><Input placeholder="House/Plot number, street" {...field} /></FormControl><FormMessage /></FormItem>)} />
              </div>
              <p className="text-xs text-muted-foreground">Province → Division → District → City are structured and come from the reference data; locality / society / phase / block are free-form so the same form works for any area in Pakistan.</p>
            </section>
          )}

          {step === 2 && (
            <section className="surface-panel space-y-4 p-5">
              <h2 className="text-base font-semibold"><WalletCards className="mr-1 inline size-4" />Pricing</h2>
              <FormField control={form.control} name="priceText" render={({ field }) => (
                <FormItem><FormLabel>Price (PKR)</FormLabel><FormControl><Input placeholder='e.g. "2 crore 50 lakh", "50 lakh", "80,000/month"' {...field} /></FormControl><FormMessage /></FormItem>)} />
              {purpose === "rent" ? (
                <FormField control={form.control} name="rentPeriod" render={({ field }) => (
                  <FormItem><FormLabel>Rental period</FormLabel><Select value={field.value ?? ""} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Per month" /></SelectTrigger></FormControl>
                    <SelectContent><SelectItem value="daily">Daily</SelectItem><SelectItem value="weekly">Weekly</SelectItem><SelectItem value="monthly">Monthly</SelectItem><SelectItem value="yearly">Yearly</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
              ) : null}
              <h2 className="text-base font-semibold"><Ruler className="mr-1 inline size-4" />Area</h2>
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="areaValue" render={({ field }) => (
                  <FormItem><FormLabel>Area</FormLabel><FormControl><Input type="number" inputMode="decimal" placeholder="5" {...field} /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="areaUnit" render={({ field }) => (
                  <FormItem><FormLabel>Unit</FormLabel><Select value={field.value ?? ""} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent><SelectItem value="marla">Marla</SelectItem><SelectItem value="kanal">Kanal</SelectItem><SelectItem value="sqft">Square Feet</SelectItem><SelectItem value="sqyd">Square Yard</SelectItem><SelectItem value="acre">Acre</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
              </div>
            </section>
          )}

          {step === 3 && (
            <section className="surface-panel space-y-4 p-5">
              <h2 className="text-base font-semibold">Features</h2>
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="bedrooms" render={({ field }) => (
                  <FormItem><FormLabel>Bedrooms</FormLabel><FormControl><Input type="number" inputMode="numeric" placeholder="3" {...field} /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="bathrooms" render={({ field }) => (
                  <FormItem><FormLabel>Bathrooms</FormLabel><FormControl><Input type="number" inputMode="numeric" placeholder="3" {...field} /></FormControl><FormMessage /></FormItem>)} />
              </div>
              <p className="text-sm font-medium">Furnished?</p>
              <div className="flex gap-2">
                <button type="button" className={`rounded-full border px-4 py-1.5 text-xs ${form.watch("furnished") ? "border-primary bg-primary text-primary-foreground" : "border-border"}`} onClick={() => form.setValue("furnished", true)}>Furnished</button>
                <button type="button" className={`rounded-full border px-4 py-1.5 text-xs ${!form.watch("furnished") ? "border-primary bg-primary text-primary-foreground" : "border-border"}`} onClick={() => form.setValue("furnished", false)}>Unfurnished</button>
              </div>
              <p className="text-sm font-medium">Amenities</p>
              <div className="flex flex-wrap gap-2">
                {AMENITY_OPTIONS.map((a) => {
                  const active = form.watch("amenities").includes(a);
                  return (
                    <button type="button" key={a}
                      className={`rounded-full border px-3 py-1.5 text-xs ${active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-secondary"}`}
                      onClick={() => {
                        const cur = form.getValues("amenities");
                        form.setValue("amenities", active ? cur.filter((x) => x !== a) : [...cur, a]);
                      }}>{a}</button>
                  );
                })}
              </div>
              <FormField control={form.control} name="customFeatures" render={({ field }) => (
                <FormItem><FormLabel>Custom features (comma separated)</FormLabel><FormControl><Input placeholder="e.g. Custom kitchen, marble floor" {...field} /></FormControl><FormMessage /></FormItem>)} />
            </section>
          )}

          {step === 4 && (
            <section className="surface-panel space-y-4 p-5">
              <h2 className="text-base font-semibold">Assign employee</h2>
              <FormField control={form.control} name="assignedTo" render={({ field }) => (
                <FormItem><FormLabel>Assigned to</FormLabel><Select value={field.value ?? ""} onValueChange={field.onChange}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>{(members ?? []).map((m) => <SelectItem key={m.id} value={m.id}>{m.full_name ?? "Unnamed"}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
              <h2 className="pt-2 text-base font-semibold">Contacts</h2>
              <p className="text-xs text-muted-foreground">Used for scheduled owner/tenant/realtor check-ins.</p>
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="ownerName" render={({ field }) => (<FormItem><FormLabel>Owner name</FormLabel><FormControl><Input placeholder="Optional" {...field} /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="ownerPhone" render={({ field }) => (<FormItem><FormLabel>Owner phone</FormLabel><FormControl><Input placeholder="03xx" {...field} /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="tenantName" render={({ field }) => (<FormItem><FormLabel>Tenant name</FormLabel><FormControl><Input placeholder="Optional" {...field} /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="tenantPhone" render={({ field }) => (<FormItem><FormLabel>Tenant phone</FormLabel><FormControl><Input placeholder="03xx" {...field} /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="realtorName" render={({ field }) => (<FormItem><FormLabel>Realtor name</FormLabel><FormControl><Input placeholder="Optional" {...field} /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="realtorPhone" render={({ field }) => (<FormItem><FormLabel>Realtor phone</FormLabel><FormControl><Input placeholder="03xx" {...field} /></FormControl><FormMessage /></FormItem>)} />
              </div>
            </section>
          )}

          {step === 5 && (
            <section className="surface-panel space-y-3 p-5">
              <h2 className="text-base font-semibold">Review</h2>
              <Review values={form.getValues()} />
            </section>
          )}

          <div className="mt-4 flex items-center justify-between">
            <Button type="button" variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>Back</Button>
            {step < STEPS.length - 1 ? (
              <Button type="button" onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}>Next <ChevronRight className="size-4" /></Button>
            ) : (
              <div className="flex gap-2">
                <Button type="submit" variant="secondary" disabled={form.formState.isSubmitting} onClick={() => setSaveAs("draft")}>
                  {form.formState.isSubmitting && saveAs === "draft" ? <Loader2 className="size-4 animate-spin" /> : "Save as draft"}
                </Button>
                <Button type="submit" disabled={form.formState.isSubmitting} onClick={() => setSaveAs("publish")}>
                  {form.formState.isSubmitting && saveAs === "publish" ? <Loader2 className="size-4 animate-spin" /> : "Publish"}
                </Button>
              </div>
            )}
          </div>
        </form>
      </Form>
    </AppShell>
  );
}

function Review({ values }: { values: Values }) {
  const parsed = values.priceText ? parsePkrAmount(values.priceText) : null;
  return (
    <dl className="space-y-1 text-sm">
      <Row label="Title" value={values.title} />
      <Row label="Type / purpose" value={`${titleCase(values.propertyType)} · ${titleCase(values.purpose)}`} />
      <Row label="Status" value={titleCase(values.status)} />
      <Row label="Price" value={parsed !== null ? `PKR ${parsed.toLocaleString("en-PK")}${values.purpose === "rent" ? `/${values.rentPeriod}` : ""}` : "—"} />
      <Row label="Area" value={values.areaValue ? `${values.areaValue} ${titleCase(values.areaUnit)}` : "—"} />
      <Row label="Beds/baths" value={`${values.bedrooms || "—"} / ${values.bathrooms || "—"}`} />
      <Row label="Location" value={[values.province, values.district, values.city].filter(Boolean).join(" · ") || "—"} />
      <Row label="Society / phase / block" value={[values.society, values.phaseBlock, values.block].filter(Boolean).join(" · ") || "—"} />
      <Row label="Assignee" value={values.assignedTo || "(defaults to you)"} />
      <p className="pt-2 text-xs text-muted-foreground">After saving, you can upload photos/videos from the property page.</p>
    </dl>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-2 border-b border-border/50 pb-1 last:border-none">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
