import { useState } from "react";
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

export const Route = createFileRoute("/auth/")({
  head: () => ({ meta: [{ title: "Sign in — EstateOS" }] }),
  component: LoginPage,
});

const schema = z.object({
  email: z.string().min(1, "Enter your email").email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});

function LoginPage() {
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: z.infer<typeof schema>) {
    setFormError(null);
    const { error } = await supabase.auth.signInWithPassword(values);
    if (error) {
      setFormError(
        error.message === "Invalid login credentials"
          ? "That email and password don't match an account."
          : error.message,
      );
      return;
    }
    const access = await getMyAccess();
    navigate({ to: roleHome(access.role), replace: true });
  }

  return (
    <div className="surface-panel p-6">
      <h1 className="text-lg font-semibold">Sign in</h1>
      <p className="mt-1 text-sm text-muted-foreground">Use the email and password your admin gave you.</p>

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

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between">
                  <FormLabel>Password</FormLabel>
                  <Link to="/auth/forgot-password" className="text-xs text-muted-foreground hover:text-foreground">
                    Forgot password?
                  </Link>
                </div>
                <FormControl>
                  <Input type="password" autoComplete="current-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </Button>
        </form>
      </Form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        New platform?{" "}
        <Link to="/auth/signup" className="font-medium text-foreground hover:underline">
          Create the first account
        </Link>
      </p>
    </div>
  );
}
