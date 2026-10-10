import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getMyAccess } from "@/lib/access.functions";
import { roleHome } from "@/lib/role-home";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

export const Route = createFileRoute("/accept-invitation")({
  head: () => ({ meta: [{ title: "Accept invitation — EstateOS" }] }),
  component: AcceptInvitationPage,
});

const schema = z
  .object({
    password: z.string().min(8, "Use at least 8 characters"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "Passwords don't match", path: ["confirm"] });

function AcceptInvitationPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setHasSession(Boolean(data.session));
      setChecking(false);
    });
  }, []);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirm: "" },
  });

  async function onSubmit(values: z.infer<typeof schema>) {
    setFormError(null);
    const { error } = await supabase.auth.updateUser({ password: values.password });
    if (error) {
      setFormError(error.message);
      return;
    }
    setDone(true);
    const access = await getMyAccess().catch(() => null);
    setTimeout(() => {
      navigate({ to: access ? roleHome(access.role) : "/auth", replace: true });
    }, 1200);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm surface-panel p-6">
        <h1 className="text-lg font-semibold">Welcome to EstateOS</h1>
        <p className="mt-1 text-sm text-muted-foreground">Set a password for your account to finish.</p>

        {checking ? (
          <div className="mt-6 flex justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : done ? (
          <Alert className="mt-6">
            <CheckCircle2 className="size-4" />
            <AlertDescription>Password set. Taking you to your workspace…</AlertDescription>
          </Alert>
        ) : !hasSession ? (
          <Alert variant="destructive" className="mt-6">
            <AlertCircle className="size-4" />
            <AlertDescription>
              This invitation link is missing or expired. Ask your admin for a new one, or{" "}
              <Link to="/auth" className="underline">sign in</Link>.
            </AlertDescription>
          </Alert>
        ) : (
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
                name="confirm"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm password</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="new-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? <Loader2 className="size-4 animate-spin" /> : "Set password"}
              </Button>
            </form>
          </Form>
        )}
      </div>
    </div>
  );
}
