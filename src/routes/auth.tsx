import { useEffect, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getMyAccess } from "@/lib/access.functions";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Eye, EyeOff, KeyRound, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in — EstateOS" },
      { name: "description", content: "Securely sign in to your EstateOS agency workspace." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const fetchAccess = useServerFn(getMyAccess);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"signin" | "reset" | "new-password">("signin");

  useEffect(() => {
    if (window.location.hash.includes("type=recovery") || new URLSearchParams(window.location.search).get("type") === "recovery") {
      setMode("new-password");
    }
  }, []);
  const [notice, setNotice] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + "/auth",
        });
        if (error) throw error;
        setNotice({ kind: "success", text: "If an account exists for that email, a reset link has been sent." });
      } else if (mode === "new-password") {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        await supabase.auth.signOut();
        setPassword("");
        setMode("signin");
        setNotice({ kind: "success", text: "Password updated. Sign in with your new password." });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        const access = await fetchAccess();
        if (!access.platformHasSuperAdmin) {
          await navigate({ to: "/bootstrap", replace: true });
        } else if (access.role === "super_admin") {
          await navigate({ to: "/platform", replace: true });
        } else if (access.role) {
          await navigate({ to: "/agency", replace: true });
        } else {
          setNotice({ kind: "error", text: "Your account does not have an assigned role. Contact the platform owner." });
        }
      }
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Unable to complete the request. Please try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link to="/" className="font-display text-lg font-semibold text-foreground">EstateOS</Link>
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to home
        </Link>
      </header>
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-16 pt-8 md:grid-cols-[1.1fr_0.9fr] md:pt-16">
        <div className="max-w-xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Your agency workspace</p>
          <h1 className="mt-4 font-display text-4xl font-semibold tracking-tight md:text-5xl">
            Good property work starts with a clear picture.
          </h1>
          <p className="mt-5 text-base leading-7 text-muted-foreground">
            Sign in to manage inventory, follow up with leads, coordinate site visits, and keep customer conversations in one place.
          </p>
          <div className="mt-8 grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
            <div className="surface-panel p-4"><p className="font-medium text-foreground">Tenant-aware access</p><p className="mt-1">Your role determines what you can see and manage.</p></div>
            <div className="surface-panel p-4"><p className="font-medium text-foreground">Built for Pakistan</p><p className="mt-1">Property areas, budgets and workflows fit local practice.</p></div>
          </div>
        </div>

        <div className="surface-panel mx-auto w-full max-w-md p-6 sm:p-8">
          <div className="mb-6 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary"><KeyRound className="size-5" /></div>
          <h2 className="text-2xl font-semibold">{mode === "signin" ? "Welcome back" : mode === "reset" ? "Reset your password" : "Choose a new password"}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {mode === "signin"
              ? "Use the email and password provided by your platform or agency administrator."
              : mode === "reset"
                ? "We'll email you a secure password reset link if the account exists."
                : "Choose a new password for your account."}
          </p>
          <form className="mt-6 space-y-4" onSubmit={submit}>
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">Work email</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@agency.com" className="h-11 w-full rounded-lg border border-input bg-background pl-10 pr-3 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring" />
              </div>
            </div>
            {mode !== "reset" ? (
              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium">{mode === "new-password" ? "New password" : "Password"}</label>
                <div className="relative">
                  <input id="password" type={showPassword ? "text" : "password"} autoComplete={mode === "new-password" ? "new-password" : "current-password"} required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === "new-password" ? "Choose at least 8 characters" : "Enter your password"} className="h-11 w-full rounded-lg border border-input bg-background px-3 pr-11 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring" />
                  <button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>
            ) : null}
            {notice ? <p role="status" className={`rounded-lg p-3 text-sm ${notice.kind === "error" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>{notice.text}</p> : null}
            <button type="submit" disabled={busy} className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60">
              {busy ? "Please wait…" : mode === "signin" ? "Sign in securely" : mode === "reset" ? "Send reset link" : "Update password"}
            </button>
          </form>
          {mode !== "new-password" ? (
            <button type="button" onClick={() => { setMode(mode === "signin" ? "reset" : "signin"); setNotice(null); }} className="mt-4 w-full text-center text-sm font-medium text-primary hover:underline">
              {mode === "signin" ? "Forgot your password?" : "Back to sign in"}
            </button>
          ) : null}
          <p className="mt-6 border-t border-border pt-5 text-xs leading-5 text-muted-foreground">
            Accounts are created by the platform owner or your agency administrator. Public self-registration is disabled to protect agency data.
          </p>
        </div>
      </section>
    </main>
  );
}
