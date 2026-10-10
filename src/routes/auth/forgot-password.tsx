import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, AlertCircle, MailCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

export const Route = createFileRoute("/auth/forgot-password")({
  head: () => ({ meta: [{ title: "Reset password — EstateOS" }] }),
  component: ForgotPasswordPage,
});

const schema = z.object({
  email: z.string().min(1, "Enter your email").email("Enter a valid email"),
});

function ForgotPasswordPage() {
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: z.infer<typeof schema>) {
    setFormError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    // Don't reveal whether the address is registered either way.
    if (error && error.status && error.status >= 500) {
      setFormError("Something went wrong sending that email. Try again in a moment.");
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="surface-panel flex flex-col items-center gap-3 p-6 text-center">
        <div className="rounded-full bg-secondary p-3 text-secondary-foreground">
          <MailCheck className="size-5" />
        </div>
        <h1 className="text-lg font-semibold">Check your email</h1>
        <p className="text-sm text-muted-foreground">
          If an account exists for that address, a reset link is on its way.
        </p>
        <Button asChild variant="secondary" className="mt-2 w-full">
          <Link to="/auth">Back to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="surface-panel p-6">
      <h1 className="text-lg font-semibold">Reset your password</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        We'll email you a link to choose a new one.
      </p>

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
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" autoComplete="email" placeholder="you@agency.com" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Sending…
              </>
            ) : (
              "Send reset link"
            )}
          </Button>
        </form>
      </Form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Link to="/auth" className="font-medium text-foreground hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
