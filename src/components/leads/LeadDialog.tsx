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
import { createLead, updateLead, fetchAssignableMembers, type LeadRow } from "@/lib/queries";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { parsePkrAmount } from "@/lib/pkr-parser";

const statusValues = ["new", "contacted", "qualified", "visit_scheduled", "negotiating", "won", "lost"] as const;

const schema = z.object({
  name: z.string().min(1, "Enter a name"),
  phone: z.string().optional(),
  whatsapp_number: z.string().optional(),
  requirement_text: z.string().optional(),
  budget_min_text: z.string().optional(),
  budget_max_text: z.string().optional(),
  preferred_city: z.string().optional(),
  preferred_locality: z.string().optional(),
  property_type: z.string().optional(),
  purpose: z.string().optional(),
  status: z.enum(statusValues),
  assigned_to: z.string().optional(),
  notes: z.string().optional(),
});
type Values = z.infer<typeof schema>;

export function LeadDialog({ lead, agencyId, open, onOpenChange, onSaved, role }: { lead?: LeadRow | undefined; agencyId: string; open: boolean; onOpenChange: (v: boolean) => void; onSaved?: () => void; role?: "super_admin" | "agency_admin" | "employee" }) {
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const { data: members } = useQuery({ queryKey: ["assignable-members", agencyId], queryFn: () => fetchAssignableMembers(agencyId) });
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: lead?.name ?? "",
      phone: lead?.phone ?? "",
      whatsapp_number: lead?.whatsapp_number ?? "",
      requirement_text: lead?.requirement_text ?? "",
      budget_min_text: lead?.budget_min_pkr != null ? String(lead.budget_min_pkr) : "",
      budget_max_text: lead?.budget_max_pkr != null ? String(lead.budget_max_pkr) : "",
      preferred_city: lead?.preferred_city ?? "",
      preferred_locality: lead?.preferred_locality ?? "",
      property_type: lead?.property_type ?? "",
      purpose: lead?.purpose ?? "",
      status: (lead?.status ?? "new") as any,
      assigned_to: lead?.assigned_to ?? "",
      notes: lead?.notes ?? "",
    },
  });

  async function onSubmit(v: Values) {
    setFormError(null);
    const budgetMin = v.budget_min_text ? parsePkrAmount(v.budget_min_text) : null;
    const budgetMax = v.budget_max_text ? parsePkrAmount(v.budget_max_text) : null;
    if (v.budget_min_text && budgetMin === null) { setFormError("Couldn't read min budget."); return; }
    if (v.budget_max_text && budgetMax === null) { setFormError("Couldn't read max budget."); return; }
    try {
      const payload: any = {
        agency_id: agencyId,
        name: v.name || null,
        phone: v.phone || null,
        whatsapp_number: v.whatsapp_number || null,
        requirement_text: v.requirement_text || null,
        budget_min_pkr: budgetMin,
        budget_max_pkr: budgetMax,
        preferred_city: v.preferred_city || null,
        preferred_locality: v.preferred_locality || null,
        property_type: (v.property_type as any) || null,
        purpose: (v.purpose as any) || null,
        status: v.status,
        assigned_to: v.assigned_to || null,
        notes: v.notes || null,
      };
      if (lead) {
        await updateLead(lead.id, payload);
        toast.success("Lead updated");
      } else {
        await createLead(payload);
        toast.success("Lead created");
      }
      await queryClient.invalidateQueries({ queryKey: ["leads", agencyId] });
      await queryClient.invalidateQueries({ queryKey: ["leads-paged"] });
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Couldn't save the lead.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{lead ? "Edit lead" : "New lead"}</DialogTitle>
          <DialogDescription>{lead ? "Update lead details and assignment." : "Add a new lead to the pipeline."}</DialogDescription>
        </DialogHeader>
        {formError ? (<Alert variant="destructive"><AlertCircle className="size-4" /><AlertDescription>{formError}</AlertDescription></Alert>) : null}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="name" render={({ field }) => (<FormItem><FormLabel>Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="phone" render={({ field }) => (<FormItem><FormLabel>Phone</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="whatsapp_number" render={({ field }) => (<FormItem><FormLabel>WhatsApp number</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
            </div>
            <FormField control={form.control} name="requirement_text" render={({ field }) => (<FormItem><FormLabel>Requirement</FormLabel><FormControl><Input placeholder="3 BHK in DHA" {...field} /></FormControl><FormMessage /></FormItem>)} />
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="budget_min_text" render={({ field }) => (<FormItem><FormLabel>Min budget</FormLabel><FormControl><Input placeholder="80 lakh" {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="budget_max_text" render={({ field }) => (<FormItem><FormLabel>Max budget</FormLabel><FormControl><Input placeholder="1.2 crore" {...field} /></FormControl><FormMessage /></FormItem>)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="preferred_city" render={({ field }) => (<FormItem><FormLabel>Preferred city</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="preferred_locality" render={({ field }) => (<FormItem><FormLabel>Preferred locality</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="property_type" render={({ field }) => (
                <FormItem><FormLabel>Property type</FormLabel><Select value={field.value ?? ""} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger></FormControl>
                  <SelectContent>
                    {["house", "apartment", "plot", "commercial", "office", "shop", "warehouse", "agricultural"].map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
                  </SelectContent></Select><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="purpose" render={({ field }) => (
                <FormItem><FormLabel>Purpose</FormLabel><Select value={field.value ?? ""} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger></FormControl>
                  <SelectContent><SelectItem value="sale">Sale</SelectItem><SelectItem value="rent">Rent</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
            </div>
            <FormField control={form.control} name="status" render={({ field }) => (
              <FormItem><FormLabel>Status</FormLabel><Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>{statusValues.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>)} />
            {role !== "employee" && (
              <FormField control={form.control} name="assigned_to" render={({ field }) => (
                <FormItem><FormLabel>Assigned to</FormLabel><Select value={field.value ?? ""} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger></FormControl>
                  <SelectContent>{(members ?? []).map((m) => <SelectItem key={m.id} value={m.id}>{m.full_name ?? "Unnamed"}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
            )}
            <FormField control={form.control} name="notes" render={({ field }) => (<FormItem><FormLabel>Notes</FormLabel><FormControl><Textarea rows={3} {...field} /></FormControl><FormMessage /></FormItem>)} />
            <DialogFooter className="flex gap-2 pt-3">
              <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? <Loader2 className="size-4 animate-spin" /> : lead ? "Update" : "Create"}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
