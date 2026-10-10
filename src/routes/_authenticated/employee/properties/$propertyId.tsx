import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowLeft,
  Home,
  Loader2,
  AlertCircle,
  Phone,
  MessageCircle,
  Image as ImageIcon,
  Video,
  Trash2,
  Upload,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { EmptyState, StatusBadge } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import {
  fetchProperty,
  fetchCheckins,
  scheduleCheckin,
  recordCheckinResponse,
  markCheckinSkipped,
  type CheckinRow,
} from "@/lib/queries";
import { PropertyMediaManager } from "@/components/property/PropertyMediaManager";
import { formatPkr, formatArea, titleCase } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/employee/properties/$propertyId")({
  head: () => ({ meta: [{ title: "Property — EstateOS" }] }),
  component: PropertyDetailPage,
});

function PropertyDetailPage() {
  const { propertyId } = Route.useParams();
  const { access } = Route.useRouteContext();

  const { data: property, isLoading } = useQuery({
    queryKey: ["property", propertyId],
    queryFn: () => fetchProperty(propertyId),
  });

  if (isLoading) {
    return (
      <AppShell title="Property">
        <Skeleton className="h-64 rounded-xl" />
      </AppShell>
    );
  }

  if (!property) {
    return (
      <AppShell title="Property not found">
        <EmptyState
          icon={Home}
          title="Property not found"
          description="It may not exist, or it isn't assigned to you."
          action={
            <Button asChild variant="secondary" className="mt-2">
              <Link to="/employee/properties">
                <ArrowLeft className="size-4" /> Back to properties
              </Link>
            </Button>
          }
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      title={property.title}
      description={[property.city, titleCase(property.purpose)].filter(Boolean).join(" · ")}
      actions={
        <Button asChild variant="ghost" size="sm">
          <Link to="/employee/properties">
            <ArrowLeft className="size-4" /> Back
          </Link>
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <InfoCard label="Status" value={<StatusBadge status={property.status} />} />
        <InfoCard label="Price" value={formatPkr(property.price_pkr ? Number(property.price_pkr) : null)} />
        <InfoCard label="Area" value={formatArea(property.area_value, property.area_unit)} />
        <InfoCard label="Assigned to" value={property.assignee_name ?? "Unassigned"} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <ContactsCard property={property} agencyId={access.agencyId!} currentUserId={access.userId} />
        <PropertyMediaManager propertyId={property.id} agencyId={access.agencyId!} readOnly />
      </div>

      <div className="mt-6">
        <CheckinsCard propertyId={propertyId} />
      </div>
    </AppShell>
  );
}

function InfoCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="surface-panel p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Contacts: owner / tenant / realtor, each with a "Schedule check-in" action
// ---------------------------------------------------------------------------

function ContactsCard({
  property,
  agencyId,
  currentUserId,
}: {
  property: { id: string; assigned_to: string | null; owner_name: string | null; owner_phone: string | null; tenant_name: string | null; tenant_phone: string | null; realtor_name: string | null; realtor_phone: string | null };
  agencyId: string;
  currentUserId: string;
}) {
  const contacts = [
    { type: "owner" as const, label: "Owner", name: property.owner_name, phone: property.owner_phone },
    { type: "tenant" as const, label: "Tenant", name: property.tenant_name, phone: property.tenant_phone },
    { type: "realtor" as const, label: "Realtor", name: property.realtor_name, phone: property.realtor_phone },
  ];
  const hasAny = contacts.some((c) => c.phone);

  return (
    <div className="surface-panel p-5">
      <p className="font-medium">Contacts</p>
      {!hasAny ? (
        <p className="mt-2 text-sm text-muted-foreground">
          No owner, tenant, or realtor phone numbers on file yet. Add them from Edit property.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {contacts
            .filter((c) => c.phone)
            .map((c) => (
              <div key={c.type} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                <div>
                  <p className="text-sm font-medium">
                    {c.label}
                    {c.name ? <span className="font-normal text-muted-foreground"> · {c.name}</span> : null}
                  </p>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Phone className="size-3" /> {c.phone}
                  </p>
                </div>
                <ScheduleCheckinDialog
                  propertyId={property.id}
                  agencyId={agencyId}
                  assignedTo={property.assigned_to}
                  createdBy={currentUserId}
                  contactType={c.type}
                  contactName={c.name}
                  contactPhone={c.phone!}
                />
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

const scheduleSchema = z.object({
  channel: z.enum(["whatsapp", "sms"]),
  scheduledFor: z.string().min(1, "Pick a date"),
});

function ScheduleCheckinDialog({
  propertyId,
  agencyId,
  assignedTo,
  createdBy,
  contactType,
  contactName,
  contactPhone,
}: {
  propertyId: string;
  agencyId: string;
  assignedTo: string | null;
  createdBy: string;
  contactType: "owner" | "tenant" | "realtor";
  contactName: string | null;
  contactPhone: string;
}) {
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const form = useForm<z.infer<typeof scheduleSchema>>({
    resolver: zodResolver(scheduleSchema),
    defaultValues: { channel: "whatsapp", scheduledFor: "" },
  });

  async function onSubmit(values: z.infer<typeof scheduleSchema>) {
    setFormError(null);
    try {
      await scheduleCheckin({
        agencyId,
        assignedTo,
        propertyId,
        contactType,
        contactName: contactName ?? undefined,
        contactPhone,
        channel: values.channel,
        scheduledFor: new Date(values.scheduledFor).toISOString(),
        createdBy,
      });
      toast.success("Check-in scheduled");
      setOpen(false);
      form.reset();
      queryClient.invalidateQueries({ queryKey: ["checkins", propertyId] });
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Couldn't schedule that check-in.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">
          <MessageCircle className="size-4" /> Schedule check-in
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schedule a check-in</DialogTitle>
          <DialogDescription>
            Sends a message to {contactName || "this contact"} ({contactPhone}) asking about the property's
            condition and whether it's vacant.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {formError ? (
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            ) : null}
            <FormField
              control={form.control}
              name="channel"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Channel</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                      <SelectItem value="sms">SMS</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="scheduledFor"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Send on</FormLabel>
                  <FormControl>
                    <Input type="datetime-local" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? <Loader2 className="size-4 animate-spin" /> : "Schedule"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Check-ins history
// ---------------------------------------------------------------------------

function CheckinsCard({ propertyId }: { propertyId: string }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["checkins", propertyId],
    queryFn: () => fetchCheckins(propertyId),
  });
  const [respondingTo, setRespondingTo] = useState<CheckinRow | null>(null);

  async function skip(id: string) {
    try {
      await markCheckinSkipped(id);
      queryClient.invalidateQueries({ queryKey: ["checkins", propertyId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update that check-in.");
    }
  }

  return (
    <div className="surface-panel p-5">
      <p className="font-medium">Check-in history</p>
      {isLoading ? (
        <Skeleton className="mt-3 h-24 rounded-lg" />
      ) : !data || data.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          No check-ins scheduled yet. Use "Schedule check-in" on a contact above.
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {data.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm">
              <div>
                <p className="font-medium">
                  {titleCase(c.contact_type)} · {titleCase(c.channel)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(c.scheduled_for).toLocaleString()}
                  {c.response_text ? ` — "${c.response_text}"` : ""}
                  {c.is_vacant ? " — reported vacant" : ""}
                </p>
                {c.provider_error ? <p className="text-xs text-destructive">{c.provider_error}</p> : null}
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={c.status} />
                {c.status === "scheduled" || c.status === "sent" ? (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => setRespondingTo(c)}>
                      <CheckCircle2 className="size-4" /> Log response
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => skip(c.id)}>
                      <XCircle className="size-4" />
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!respondingTo} onOpenChange={(o) => !o && setRespondingTo(null)}>
        {respondingTo ? (
          <ResponseDialog
            checkin={respondingTo}
            onDone={() => {
              setRespondingTo(null);
              queryClient.invalidateQueries({ queryKey: ["checkins", propertyId] });
            }}
          />
        ) : null}
      </Dialog>
    </div>
  );
}

const responseSchema = z.object({
  responseText: z.string().optional(),
  propertyCondition: z.string().optional(),
  isVacant: z.enum(["yes", "no"]),
});

function ResponseDialog({ checkin, onDone }: { checkin: CheckinRow; onDone: () => void }) {
  const form = useForm<z.infer<typeof responseSchema>>({
    resolver: zodResolver(responseSchema),
    defaultValues: { responseText: "", propertyCondition: "", isVacant: "no" },
  });

  async function onSubmit(values: z.infer<typeof responseSchema>) {
    try {
      await recordCheckinResponse(checkin.id, {
        responseText: values.responseText,
        propertyCondition: values.propertyCondition,
        isVacant: values.isVacant === "yes",
      });
      toast.success("Response logged");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save that response.");
    }
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Log their response</DialogTitle>
        <DialogDescription>From the {titleCase(checkin.contact_type)}'s reply.</DialogDescription>
      </DialogHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="responseText"
            render={({ field }) => (
              <FormItem>
                <FormLabel>What they said</FormLabel>
                <FormControl>
                  <Textarea rows={3} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="propertyCondition"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Condition noted</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. Good, minor plumbing issue" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="isVacant"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Currently vacant?</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="no">No</SelectItem>
                    <SelectItem value="yes">Yes — follow up for new business</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <DialogFooter>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? <Loader2 className="size-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </DialogContent>
  );
}

