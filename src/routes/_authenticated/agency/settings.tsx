import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { supabase } from "@/integrations/supabase/client";
import { fetchAgencyDetail } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/agency/settings")({
  head: () => ({ meta: [{ title: "Agency settings — EstateOS" }] }),
  component: AgencySettingsPage,
});

const schema = z.object({
  name: z.string().min(2, "Enter an agency name"),
  phone: z.string().optional(),
  whatsappNumber: z.string().optional(),
  officeAddress: z.string().optional(),
});

function AgencySettingsPage() {
  const { access } = Route.useRouteContext();
  const agencyId = access.agencyId!;
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);

  const { data: agency, isLoading } = useQuery({
    queryKey: ["agency-detail", agencyId],
    queryFn: () => fetchAgencyDetail(agencyId),
  });

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", phone: "", whatsappNumber: "", officeAddress: "" },
  });

  useEffect(() => {
    if (agency) {
      form.reset({
        name: agency.name,
        phone: agency.phone ?? "",
        whatsappNumber: agency.whatsapp_number ?? "",
        officeAddress: agency.office_address ?? "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agency]);

  async function onSubmit(values: z.infer<typeof schema>) {
    setFormError(null);
    const { error } = await supabase
      .from("agencies")
      .update({
        name: values.name,
        phone: values.phone || null,
        whatsapp_number: values.whatsappNumber || null,
        office_address: values.officeAddress || null,
      })
      .eq("id", agencyId);
    if (error) {
      setFormError(error.message);
      return;
    }
    toast.success("Agency updated");
    queryClient.invalidateQueries({ queryKey: ["agency-detail", agencyId] });
    queryClient.invalidateQueries({ queryKey: ["my-access"] });
  }

  if (isLoading) {
    return (
      <AppShell title="Agency settings">
        <Skeleton className="h-64 rounded-xl" />
      </AppShell>
    );
  }

  return (
    <AppShell title="Agency settings" description="Your agency's own profile.">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="surface-panel max-w-md space-y-4 p-6">
          {formError ? (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          ) : null}
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Agency name</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Phone</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="whatsappNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>WhatsApp number</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="officeAddress"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Office address</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? <Loader2 className="size-4 animate-spin" /> : "Save changes"}
          </Button>
        </form>
      </Form>
    </AppShell>
  );
}
