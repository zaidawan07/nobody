import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  fetchLocationChildren,
  fetchAssignableMembers,
  setPropertyStatus,
  updateProperty,
  type PropertyRow,
} from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";

const propertyTypeValues = ["house", "apartment", "plot", "commercial", "office", "shop", "warehouse", "agricultural"] as const;
const areaUnitValues = ["marla", "kanal", "sqft", "sqyd", "acre"] as const;
const statuses = ["draft", "available", "reserved", "sold", "rented", "unavailable", "expired", "inactive"] as const;
const provincesByLocation = "with-src";

const editSchema = z.object({
  title: z.string().min(2, "Enter a title"),
  referenceCode: z.string().optional(),
  propertyType: z.enum(propertyTypeValues),
  purpose: z.enum(["sale", "rent"]),
  status: z.enum(statuses),
  province: z.string().optional(),
  division: z.string().optional(),
  district: z.string().optional(),
  tehsil: z.string().optional(),
  city: z.string().optional(),
  locality: z.string().optional(),
  society: z.string().optional(),
  phaseBlock: z.string().optional(),
  block: z.string().optional(),
  address: z.string().optional(),
  latitude: z.string().optional(),
  longitude: z.string().optional(),
  areaValue: z.string().optional(),
  areaUnit: z.string().optional(),
  bedrooms: z.string().optional(),
  bathrooms: z.string().optional(),
  furnished: z.boolean().optional(),
  amenitiesText: z.string().optional(),
  description: z.string().optional(),
  ownerName: z.string().optional(),
  ownerPhone: z.string().optional(),
  tenantName: z.string().optional(),
  tenantPhone: z.string().optional(),
  realtorName: z.string().optional(),
  realtorPhone: z.string().optional(),
  assignedTo: z.string().optional(),
});

type FieldValues = z.infer<typeof editSchema>;

function layersOfAll(rows: LocationRow[], kind: string): LocationRow[] {
  return rows.filter((r) => r.kind === kind);
}

function childrenByName(rows: LocationRow[], kind: string, parentName: string): LocationRow[] {
  const parent = rows.find((r) => r.name === parentName && (r.kind === parentKindOf(kind)));
  if (!parent) return [];
  return rows.filter((r) => r.kind === kind && r.parent_id === parent.id).sort((a, b) => a.name.localeCompare(b.name));
}
function parentKindOf(kind: string): string {
  switch (kind) {
    case "division": return "province";
    case "district": return "division";
    case "city": return "district";
    case "tehsil": return "city";
    case "locality": return "tehsil";
    case "society": return "locality";
    case "phase": return "society";
    case "block": return "phase";
    default: return "";
  }
}

export function EditPropertyDialog({ property, onDone }: { property: PropertyRow; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const { data: members } = useQuery({ queryKey: ["assignable-members", property.agency_id], queryFn: () => fetchAssignableMembers(property.agency_id) });
  const { data: communitiesData } = useQuery({ queryKey: ["locations-all"], queryFn: async () => {
    const { data } = await supabase.from("locations").select("id,name,kind,parent_id");
    return (data ?? []) as LocationRow[];
  } });
  const rows = communitiesData ?? [];
  const provinceRows = locationsUnder(rows, "province", null);
  const form = useForm<FieldValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      title: property.title,
      referenceCode: property.reference_code ?? "",
      propertyType: (property.property_type ?? "house") as (typeof propertyTypeValues)[number],
      purpose: property.purpose === "rent" ? "rent" : "sale",
      status: (property.status ?? "available") as (typeof statuses)[number],
      province: property.province ?? "",
      division: property.division ?? "",
      district: property.district ?? "",
      tehsil: property.tehsil ?? "",
      city: property.city ?? "",
      locality: property.locality ?? "",
      society: property.society ?? "",
      phaseBlock: property.phase_block ?? "",
      block: property.block ?? "",
      address: property.address ?? "",
      latitude: property.latitude != null ? String(property.latitude) : "",
      longitude: property.longitude != null ? String(property.longitude) : "",
      areaValue: property.area_value != null ? String(property.area_value) : "",
      areaUnit: property.area_unit ?? "marla",
      bedrooms: property.bedrooms != null ? String(property.bedrooms) : "",
      bathrooms: property.bathrooms != null ? String(property.bathrooms) : "",
      furnished: property.furnished ?? false,
      amenitiesText: (property.features ?? []).join(", "),
      description: property.description ?? "",
      ownerName: property.owner_name ?? "",
      ownerPhone: property.owner_phone ?? "",
      tenantName: property.tenant_name ?? "",
      tenantPhone: property.tenant_phone ?? "",
      realtorName: property.realtor_name ?? "",
      realtorPhone: property.realtor_phone ?? "",
      assignedTo: property.assigned_to ?? "",
    },
  });

  const provinceForDivision = form.watch("province") ?? "";
  const divisionForDistrict = form.watch("division") ?? "";
  const districtForCity = form.watch("district") ?? "";

  async function onSubmit(values: FieldValues) {
    setFormError(null);
    try {
      await updateProperty(property.id, {
        title: values.title,
        reference_code: values.referenceCode || null,
        property_type: values.propertyType as never,
        purpose: values.purpose as never,
        status: values.status as never,
        province: values.province || null,
        division: values.division || null,
        district: values.district || null,
        tehsil: values.tehsil || null,
        city: values.city || null,
        locality: values.locality || null,
        society: values.society || null,
        phase_block: values.phaseBlock || null,
        block: values.block || null,
        address: values.address || null,
        latitude: values.latitude ? Number(values.latitude) : null,
        longitude: values.longitude ? Number(values.longitude) : null,
        area_value: values.areaValue ? Number(values.areaValue) : null,
        area_unit: (values.areaUnit as never) ?? null,
        bedrooms: values.bedrooms ? Number(values.bedrooms) : null,
        bathrooms: values.bathrooms ? Number(values.bathrooms) : null,
        furnished: values.furnished ?? false,
        features: values.amenitiesText ? values.amenitiesText.split(",").map((s) => s.trim()).filter(Boolean) : [],
        description: values.description || null,
        owner_name: values.ownerName || null,
        owner_phone: values.ownerPhone || null,
        tenant_name: values.tenantName || null,
        tenant_phone: values.tenantPhone || null,
        realtor_name: values.realtorName || null,
        realtor_phone: values.realtorPhone || null,
        assigned_to: values.assignedTo || null,
      });
      if (values.status !== property.status) {
        try { await setPropertyStatus(property.id, values.status as never); } catch (e) { /* setPropertyStatus may be needed for non-default updates (see queries.ts) */ }
      }
      toast.success("Property updated");
      await queryClient.invalidateQueries({ queryKey: ["property", property.id] });
      await queryClient.invalidateQueries({ queryKey: ["properties", property.agency_id] });
      await queryClient.invalidateQueries({ queryKey: ["properties-paged"] });
      setOpen(false);
      onDone();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Couldn't save that property.");
    }
  }

  const divisionsForProvince = divisionOptionsFor(rows, form.watch("province"));

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setOpen(false); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit property</DialogTitle>
          <DialogDescription>Update the property details. Media uploads remain on this page.</DialogDescription>
        </DialogHeader>
        {formError ? (
          <Alert variant="destructive"><AlertCircle className="size-4" /><AlertDescription>{formError}</AlertDescription></Alert>
        ) : null}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="title" render={({ field }) => (
              <FormItem><FormLabel>Title</FormLabel><FormControl><Input placeholder="3-bed house in DHA" {...field} /></FormControl><FormMessage /></FormItem>)} />
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="propertyType" render={({ field }) => (
                <FormItem><FormLabel>Type</FormLabel><Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent>
                  {propertyTypeValues.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="purpose" render={({ field }) => (
                <FormItem><FormLabel>Purpose</FormLabel><Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent>
                  <SelectItem value="sale">Sale</SelectItem><SelectItem value="rent">Rent</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
            </div>
            <FormField control={form.control} name="status" render={({ field }) => (
              <FormItem><FormLabel>Status</FormLabel><Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent>
                {statuses.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
            <FormField control={form.control} name="referenceCode" render={({ field }) => (
              <FormItem><FormLabel>Reference code</FormLabel><FormControl><Input placeholder="e.g. LAH-2026-014" {...field} /></FormControl><FormMessage /></FormItem>)} />

            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="province" render={({ field }) => (
                <FormItem><FormLabel>Province</FormLabel><Select value={field.value ?? ""} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger></FormControl><SelectContent>
                  {locationsUnder(rows, "province", null).map((r) => <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="division" render={({ field }) => (
                <FormItem><FormLabel>Division</FormLabel><Select value={field.value ?? ""} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger></FormControl><SelectContent>
                  {divisionOptionsFor(rows, form.watch("province")).map((r) => <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="district" render={({ field }) => (
                <FormItem><FormLabel>District</FormLabel><Select value={field.value ?? ""} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger></FormControl><SelectContent>
                  {childrenByName(rows, "district", form.watch("division") ?? "").map((r) => <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="city" render={({ field }) => (
                <FormItem><FormLabel>City</FormLabel><Select value={field.value ?? ""} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger></FormControl><SelectContent>
                  {childrenByName(rows, "city", form.watch("district") ?? "").map((r) => <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="tehsil" render={({ field }) => (
                <FormItem><FormLabel>Tehsil</FormLabel><Select value={field.value ?? ""} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue placeholder="Select (optional)" /></SelectTrigger></FormControl><SelectContent>
                  {childrenByName(rows, "tehsil", form.watch("city") ?? "").map((r) => <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="locality" render={({ field }) => (
                <FormItem><FormLabel>Locality</FormLabel><FormControl><Input placeholder="e.g. Gulberg II" {...field} /></FormControl><FormMessage /></FormItem>)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="society" render={({ field }) => (
                <FormItem><FormLabel>Society</FormLabel><FormControl><Input placeholder="e.g. DHA" {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="phaseBlock" render={({ field }) => (
                <FormItem><FormLabel>Phase</FormLabel><FormControl><Input placeholder="e.g. Phase 6" {...field} /></FormControl><FormMessage /></FormItem>)} />
            </div>
            <FormField control={form.control} name="block" render={({ field }) => (
              <FormItem><FormLabel>Block</FormLabel><FormControl><Input placeholder="e.g. Block C" {...field} /></FormControl><FormMessage /></FormItem>)} />
            <FormField control={form.control} name="address" render={({ field }) => (
              <FormItem><FormLabel>Address</FormLabel><FormControl><Input placeholder="House/Plot number" {...field} /></FormControl><FormMessage /></FormItem>)} />

            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="latitude" render={({ field }) => (
                <FormItem><FormLabel>Latitude</FormLabel><FormControl><Input placeholder="31.5204" {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="longitude" render={({ field }) => (
                <FormItem><FormLabel>Longitude</FormLabel><FormControl><Input placeholder="74.3587" {...field} /></FormControl><FormMessage /></FormItem>)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="areaValue" render={({ field }) => (
                <FormItem><FormLabel>Area</FormLabel><FormControl><Input type="number" placeholder="5" {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="areaUnit" render={({ field }) => (
                <FormItem><FormLabel>Unit</FormLabel><Select value={field.value ?? ""} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent>
                  {areaUnitValues.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="bedrooms" render={({ field }) => (
                <FormItem><FormLabel>Bedrooms</FormLabel><FormControl><Input type="number" placeholder="3" {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="bathrooms" render={({ field }) => (
                <FormItem><FormLabel>Bathrooms</FormLabel><FormControl><Input type="number" placeholder="3" {...field} /></FormControl><FormMessage /></FormItem>)} />
            </div>
            <FormField control={form.control} name="furnished" render={({ field }) => (
              <FormItem><FormLabel>Furnished?</FormLabel><Select value={field.value ? "yes" : "no"} onValueChange={(v) => field.onChange(v === "yes")}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="yes">Furnished</SelectItem><SelectItem value="no">Unfurnished</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
            <FormField control={form.control} name="amenitiesText" render={({ field }) => (
              <FormItem><FormLabel>Amenities (comma separated)</FormLabel><FormControl><Input placeholder="Electricity, Gas, Solar" {...field} /></FormControl><FormMessage /></FormItem>)} />
            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea rows={3} {...field} /></FormControl><FormMessage /></FormItem>)} />

            <h3 className="pt-2 text-sm font-semibold">Contacts</h3>
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="ownerName" render={({ field }) => (<FormItem><FormLabel>Owner name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="ownerPhone" render={({ field }) => (<FormItem><FormLabel>Owner phone</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="tenantName" render={({ field }) => (<FormItem><FormLabel>Tenant name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="tenantPhone" render={({ field }) => (<FormItem><FormLabel>Tenant phone</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="realtorName" render={({ field }) => (<FormItem><FormLabel>Realtor name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="realtorPhone" render={({ field }) => (<FormItem><FormLabel>Realtor phone</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
            </div>
            <FormField control={form.control} name="assignedTo" render={({ field }) => (
              <FormItem><FormLabel>Assigned employee</FormLabel><Select value={field.value ?? ""} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger></FormControl><SelectContent>
                {(members ?? []).map((m) => <SelectItem key={m.id} value={m.id}>{m.full_name ?? "Unnamed"}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />

            <DialogFooter className="flex gap-2 pt-3">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit">{form.formState.isSubmitting ? <Loader2 className="size-4 animate-spin" /> : "Save"}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function divisionOptionsFor(rows: LocationRow[], provinceName: string | undefined): LocationRow[] {
  if (!provinceName) return [];
  const parent = rows.find((r) => r.name === provinceName && r.kind === "province");
  if (!parent) return [];
  return rows.filter((r) => r.kind === "division" && r.parent_id === parent.id).sort((a, b) => a.name.localeCompare(b.name));
}
function locationsUnder(rows: LocationRow[], kind: string, parent: null | string): LocationRow[] {
  if (parent === null) return rows.filter((r) => r.kind === kind).sort((a, b) => a.name.localeCompare(b.name));
  const parentRow = rows.find((r) => r.name === parent);
  return parentRow ? rows.filter((r) => r.kind === kind && r.parent_id === parentRow.id).sort((a, b) => a.name.localeCompare(b.name)) : [];
}

interface LocationRow { id: string; name: string; kind: string; parent_id: string | null; }
