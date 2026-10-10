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
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/agency/whatsapp")({
  head: () => ({ meta: [{ title: "WhatsApp — EstateOS" }] }),
  component: WhatsAppPage,
});

const schema = z.object({
  whatsappNumber: z.string().optional(),
  displayName: z.string().optional(),
  aiGreeting: z.string().optional(),
  autoCreateLeads: z.boolean(),
});

async function fetchConfig(agencyId: string) {
  const { data, error } = await supabase
    .from("whatsapp_configs")
    .select("*")
    .eq("agency_id", agencyId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function WhatsAppPage() {
  const { access } = Route.useRouteContext();
  const agencyId = access.agencyId!;
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);

  const { data: config, isLoading } = useQuery({
    queryKey: ["whatsapp-config", agencyId],
    queryFn: () => fetchConfig(agencyId),
  });

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { whatsappNumber: "", displayName: "", aiGreeting: "", autoCreateLeads: true },
  });

  useEffect(() => {
    if (config) {
      form.reset({
        whatsappNumber: config.whatsapp_number ?? "",
        displayName: config.display_name ?? "",
        aiGreeting: config.ai_greeting ?? "",
        autoCreateLeads: config.auto_create_leads,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  async function onSubmit(values: z.infer<typeof schema>) {
    setFormError(null);
    const { error } = await supabase
      .from("whatsapp_configs")
      .upsert(
        {
          agency_id: agencyId,
          whatsapp_number: values.whatsappNumber || null,
          display_name: values.displayName || null,
          ai_greeting: values.aiGreeting || null,
          auto_create_leads: values.autoCreateLeads,
        },
        { onConflict: "agency_id" },
      );
    if (error) {
      setFormError(error.message);
      return;
    }
    toast.success("WhatsApp settings saved");
    queryClient.invalidateQueries({ queryKey: ["whatsapp-config", agencyId] });
  }

  if (isLoading) {
    return (
      <AppShell title="WhatsApp">
        <Skeleton className="h-64 rounded-xl" />
      </AppShell>
    );
  }

  return (
    <AppShell title="WhatsApp" description="Connect your agency's WhatsApp number.">
      <div className="surface-panel max-w-md space-y-4 p-6">
        <p className="text-sm">
          Connection status:{" "}
          <span className="font-medium">{config?.connection_status ?? "not_connected"}</span>
        </p>
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
              name="whatsappNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>WhatsApp number</FormLabel>
                  <FormControl><Input placeholder="+92..." {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="displayName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Display name</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="aiGreeting"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>AI greeting</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="autoCreateLeads"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between">
                  <FormLabel>Auto-create leads</FormLabel>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? <Loader2 className="size-4 animate-spin" /> : "Save"}
            </Button>
          </form>
        </Form>
      </div>
    </AppShell>
  );
}
