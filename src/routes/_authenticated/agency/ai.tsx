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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/agency/ai")({
  head: () => ({ meta: [{ title: "AI assistant — EstateOS" }] }),
  component: AiConfigPage,
});

const schema = z.object({
  aiEnabled: z.boolean(),
  aiLanguage: z.string().min(1),
  aiTone: z.string().optional(),
  aiInstructions: z.string().optional(),
  handoffKeywords: z.string().optional(),
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

function AiConfigPage() {
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
    defaultValues: { aiEnabled: false, aiLanguage: "auto", aiTone: "", aiInstructions: "", handoffKeywords: "" },
  });

  useEffect(() => {
    if (config) {
      form.reset({
        aiEnabled: config.ai_enabled,
        aiLanguage: config.ai_language,
        aiTone: config.ai_tone ?? "",
        aiInstructions: config.ai_instructions ?? "",
        handoffKeywords: (config.handoff_keywords ?? []).join(", "),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  async function onSubmit(values: z.infer<typeof schema>) {
    setFormError(null);
    const keywords = (values.handoffKeywords ?? "")
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    const { error } = await supabase
      .from("whatsapp_configs")
      .upsert(
        {
          agency_id: agencyId,
          ai_enabled: values.aiEnabled,
          ai_language: values.aiLanguage,
          ai_tone: values.aiTone || null,
          ai_instructions: values.aiInstructions || null,
          handoff_keywords: keywords,
        },
        { onConflict: "agency_id" },
      );
    if (error) {
      setFormError(error.message);
      return;
    }
    toast.success("AI settings saved");
    queryClient.invalidateQueries({ queryKey: ["whatsapp-config", agencyId] });
  }

  if (isLoading) {
    return (
      <AppShell title="AI assistant">
        <Skeleton className="h-64 rounded-xl" />
      </AppShell>
    );
  }

  return (
    <AppShell title="AI assistant" description="Tune the WhatsApp AI for this agency.">
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
            name="aiEnabled"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between">
                <FormLabel>AI enabled</FormLabel>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="aiLanguage"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Language</FormLabel>
                <FormControl><Input placeholder="auto / English / Urdu" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="aiTone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tone</FormLabel>
                <FormControl><Input placeholder="e.g. friendly, professional" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="aiInstructions"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Instructions</FormLabel>
                <FormControl><Textarea rows={4} {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="handoffKeywords"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Handoff keywords (comma-separated)</FormLabel>
                <FormControl><Input placeholder="manager, call me, agent" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? <Loader2 className="size-4 animate-spin" /> : "Save"}
          </Button>
        </form>
      </Form>
    </AppShell>
  );
}
