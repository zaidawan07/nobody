import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, AlertCircle, MailCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

export const Route = createFileRoute("/auth/signup")({
  head: () => ({ meta: [{ title: "Create account — EstateOS" }] }),
  component: SignupPage,
});

const schema = z
  .object({
    fullName: z.string().min(2, "Enter your name"),
    email: z.string().min(1, "Enter your email").email("Enter a valid email"),
    password: z.string().min(8, "At least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

function SignupPage() {
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: "", email: "", password: "", confirmPassword: "" },
  });

  async function onSubmit(values: z.infer<typeof schema>) {
    setFormError(null);
    const { data, error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: { data: { full_name: values.fullName } },
    });
    if (error) {
      setFormError(error.message);
      return;
    }
    if (data.session) {
      // Confirmation disabled on this project: already signed in. A fresh
      // signup has no role/agency yet -- /pending explains what's next.
      navigate({ to: "/pending", replace: true });
    } else {
      setCheckEmail(true);
    }
  }

  if (checkEmail) {
    return (
      <div className="surface-panel flex flex-col items-center gap-3 p-6 text-center">
        <div className="rounded-full bg-secondary p-3 text-secondary-foreground">
          <MailCheck className="size-5" />
        </div>
        <h1 className="text-lg font-semibold">Check your email</h1>
        <p className="text-sm text-muted-foreground">
          Confirm your address to finish creating your account, then come back and sign in.
        </p>
        <Button asChild variant="secondary" className="mt-2 w-full">
          <Link to="/auth">Back to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="surface-panel p-6">
      <h1 className="text-lg font-semibold">Create an account</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Most people on EstateOS are added by an admin and don't need this. Use this form to set up
        a brand-new platform, or if you were told to create your own account.
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
            name="fullName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Full name</FormLabel>
                <FormControl>
                  <Input autoComplete="name" placeholder="Your name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

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
                <FormLabel>Password</FormLabel>
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
                <FormLabel>Confirm password</FormLabel>
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
                <Loader2 className="size-4 animate-spin" /> Creating account…
              </>
            ) : (
              "Create account"
            )}
          </Button>
        </form>
      </Form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link to="/auth" className="font-medium text-foreground hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
