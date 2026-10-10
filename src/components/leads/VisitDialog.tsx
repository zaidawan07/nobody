import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createVisit, updateVisit, fetchLeads, fetchAssignableMembers, fetchProperties, type VisitRow } from "@/lib/queries";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const visitStatusValues = ["requested", "confirmed", "completed", "cancelled", "no_show"] as const;

const schema = z.object({
  lead_id: z.string().optional(),
  property_id: z.string().optional(),
  requested_at: z.string().optional(),
  scheduled_at: z.string().optional(),
  status: z.enum(visitStatusValues),
  assigned_to: z.string().optional(),
  notes: z.string().optional(),
  confirmed: z.boolean().optional(),
});

type Values = z.infer<typeof schema>;

export function VisitDialog({ visit, agencyId, open, onOpenChange, onSaved, role }: { visit?: VisitRow | undefined; agencyId: string; open: boolean; onOpenChange: (v: boolean) => void; onSaved?: () => void; role?: "super_admin" | "agency_admin" | "employee" }) {
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const { data: leads } = useQuery({ queryKey: ["leads", agencyId], queryFn: () => fetchLeads(agencyId) });
  const { data: members } = useQuery({ queryKey: ["assignable-members", agencyId], queryFn: () => fetchAssignableMembers(agencyId) });
  const { data: properties } = useQuery({ queryKey: ["properties", agencyId], queryFn: () => fetchProperties(agencyId) });
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      lead_id: visit?.lead_id ?? "",
      property_id: visit?.property_id ?? "",
      requested_at: visit?.requested_at ? toLocalInput(visit.requested_at) : "",
      scheduled_at: visit?.scheduled_at ? toLocalInput(visit.scheduled_at) : "",
      status: (visit?.status ?? "requested") as any,
      assigned_to: visit?.assigned_to ?? "",
      notes: visit?.notes ?? "",
      confirmed: visit?.confirmed ?? false,
    },
  });

  async function onSubmit(v: Values) {
    setFormError(null);
    try {
      const payload: any = {
        agency_id: agencyId,
        lead_id: v.lead_id || null,
        property_id: v.property_id || null,
        requested_at: v.requested_at ? new Date(v.requested_at).toISOString() : null,
        scheduled_at: v.scheduled_at ? new Date(v.scheduled_at).toISOString() : null,
        status: v.status,
        assigned_to: v.assigned_to || null,
        notes: v.notes || null,
        confirmed: v.confirmed ?? false,
      };
      if (visit) {
        await updateVisit(visit.id, payload);
        toast.success("Visit updated");
      } else {
        await createVisit(payload);
        toast.success("Visit created");
      }
      await queryClient.invalidateQueries({ queryKey: ["visits", agencyId] });
      await queryClient.invalidateQueries({ queryKey: ["visits-paged"] });
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Couldn't save the visit.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{visit ? "Edit visit" : "New visit"}</DialogTitle>
          <DialogDescription>{visit ? "Update the visit." : "Schedule a new site visit."}</DialogDescription>
        </DialogHeader>
        {formError ? (<Alert variant="destructive"><AlertCircle className="size-4" /><AlertDescription>{formError}</AlertDescription></Alert>) : null}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="lead_id" render={({ field }) => (
              <FormItem><FormLabel>Lead</FormLabel><Select value={field.value ?? ""} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue placeholder="Select lead" /></SelectTrigger></FormControl>
                <SelectContent>{(leads ?? []).map((l) => (<SelectItem key={l.id} value={l.id}>{l.name ?? l.id}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>)} />
            <FormField control={form.control} name="property_id" render={({ field }) => (
              <FormItem><FormLabel>Property</FormLabel><Select value={field.value ?? ""} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue placeholder="Select property" /></SelectTrigger></FormControl>
                <SelectContent>{(properties ?? []).map((p) => (<SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>)} />
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="requested_at" render={({ field }) => (<FormItem><FormLabel>Requested at</FormLabel><FormControl><Input type="datetime-local" {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="scheduled_at" render={({ field }) => (<FormItem><FormLabel>Scheduled at</FormLabel><FormControl><Input type="datetime-local" {...field} /></FormControl><FormMessage /></FormItem>)} />
            </div>
            <FormField control={form.control} name="status" render={({ field }) => (
              <FormItem><FormLabel>Status</FormLabel><Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>{visitStatusValues.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>)} />
            {role !== "employee" && (
              <FormField control={form.control} name="assigned_to" render={({ field }) => (
                <FormItem><FormLabel>Assigned to</FormLabel><Select value={field.value ?? ""} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger></FormControl>
                  <SelectContent>{(members ?? []).map((m) => <SelectItem key={m.id} value={m.id}>{m.full_name ?? "Unnamed"}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
            )}
            <FormField control={form.control} name="notes" render={({ field }) => (<FormItem><FormLabel>Notes</FormLabel><FormControl><Textarea rows={3} {...field} /></FormControl><FormMessage /></FormItem>)} />
            <div className="flex items-center gap-2 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={!!form.watch("confirmed")} onChange={(e) => form.setValue("confirmed", e.target.checked)} /> Confirmed
              </label>
            </div>
            <DialogFooter className="flex gap-2 pt-3">
              <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? <Loader2 className="size-4 animate-spin" /> : visit ? "Update" : "Create"}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function toLocalInput(isoOrAny: string): string {
  try {
    const d = new Date(isoOrAny);
    const offset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - offset).toISOString().slice(0, 16);
  } catch {
    return "";
  }
}
