import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/employee/profile")({
  head: () => ({ meta: [{ title: "My profile — EstateOS" }] }),
  component: EmployeeProfilePage,
});

const schema = z.object({
  fullName: z.string().min(2, "Enter your name"),
  phone: z.string().optional(),
  jobTitle: z.string().optional(),
});

function EmployeeProfilePage() {
  const { access } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: access.fullName ?? "", phone: "", jobTitle: "" },
  });

  async function onSubmit(values: z.infer<typeof schema>) {
    setFormError(null);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: values.fullName, phone: values.phone || null, job_title: values.jobTitle || null })
      .eq("id", access.userId);
    if (error) {
      setFormError(error.message);
      return;
    }
    toast.success("Profile updated");
    queryClient.invalidateQueries({ queryKey: ["my-access"] });
  }

  return (
    <AppShell title="My profile" description="Your details within the agency.">
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
            name="fullName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Full name</FormLabel>
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
            name="jobTitle"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Job title</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="border-t border-border pt-4 text-xs text-muted-foreground">
            Email: {access.email} · Agency: {access.agencyName}
          </div>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? <Loader2 className="size-4 animate-spin" /> : "Save changes"}
          </Button>
        </form>
      </Form>
    </AppShell>
  );
}
