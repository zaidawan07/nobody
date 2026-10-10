import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getMyAccess } from "@/lib/access.functions";
import { roleHome } from "@/lib/role-home";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

export const Route = createFileRoute("/auth/reset-password")({
  ssr: false,
  head: () => ({ meta: [{ title: "Choose a new password — EstateOS" }] }),
  component: ResetPasswordPage,
});

const schema = z
  .object({
    password: z.string().min(8, "At least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"checking" | "ready" | "invalid">("checking");
  const [formError, setFormError] = useState<string | null>(null);

  // The link from the reset email carries a one-time recovery token; the
  // Supabase client exchanges it for a session automatically on load and
  // fires PASSWORD_RECOVERY once that's done. getSession() covers the case
  // where that already happened before this listener attached.
  useEffect(() => {
    let cancelled = false;
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" && !cancelled) setStatus("ready");
    });
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session) setStatus("ready");
    });
    const timeout = setTimeout(() => {
      if (!cancelled) setStatus((current) => (current === "checking" ? "invalid" : current));
    }, 3000);
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  async function onSubmit(values: z.infer<typeof schema>) {
    setFormError(null);
    const { error } = await supabase.auth.updateUser({ password: values.password });
    if (error) {
      setFormError(error.message);
      return;
    }
    const access = await getMyAccess();
    navigate({ to: roleHome(access.role), replace: true });
  }

  if (status === "checking") {
    return (
      <div className="surface-panel flex flex-col items-center gap-3 p-6 text-center text-sm text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        Confirming your reset link…
      </div>
    );
  }

  if (status === "invalid") {
    return (
      <div className="surface-panel flex flex-col items-center gap-3 p-6 text-center">
        <div className="rounded-full bg-secondary p-3 text-secondary-foreground">
          <AlertCircle className="size-5" />
        </div>
        <h1 className="text-lg font-semibold">This link isn't valid</h1>
        <p className="text-sm text-muted-foreground">
          Reset links expire after a while, or it's already been used. Request a new one.
        </p>
        <Button asChild className="mt-2 w-full">
          <Link to="/auth/forgot-password">Request a new link</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="surface-panel p-6">
      <h1 className="text-lg font-semibold">Choose a new password</h1>
      <p className="mt-1 text-sm text-muted-foreground">Make it at least 8 characters.</p>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 space-y-4">
          {formError ? (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          ) : null}

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>New password</FormLabel>
                <FormControl>
                  <Input type="password" autoComplete="new-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Confirm new password</FormLabel>
                <FormControl>
                  <Input type="password" autoComplete="new-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Saving…
              </>
            ) : (
              "Save new password"
            )}
          </Button>
        </form>
      </Form>
    </div>
  );
}
