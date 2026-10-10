import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, Clock, AlertCircle, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getMyAccess, claimSuperAdmin } from "@/lib/access.functions";
import { roleHome } from "@/lib/role-home";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

export const Route = createFileRoute("/_authenticated/pending")({
  head: () => ({ meta: [{ title: "Waiting for access — EstateOS" }] }),
  component: PendingPage,
});

function PendingPage() {
  const { access } = Route.useRouteContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  async function claim() {
    setClaiming(true);
    setError(null);
    try {
      await claimSuperAdmin();
      const fresh = await getMyAccess();
      queryClient.setQueryData(["my-access"], fresh);
      navigate({ to: roleHome(fresh.role), replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't claim the platform owner seat.");
      setClaiming(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm surface-panel p-6 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
          <Clock className="size-5" />
        </div>
        <h1 className="mt-4 text-lg font-semibold">Your account isn't linked to an agency yet</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Signed in as {access?.email}. An agency admin needs to add you as a team member before
          you can see anything here.
        </p>

        {!access?.platformHasSuperAdmin ? (
          <div className="mt-6 space-y-3 border-t border-border pt-6 text-left">
            <p className="text-sm text-muted-foreground">
              Nobody has set up this platform yet. If that's you, claim the platform owner seat —
              this can only happen once.
            </p>
            {error ? (
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <Button className="w-full" onClick={claim} disabled={claiming}>
              <ShieldCheck className="size-4" />
              {claiming ? "Claiming…" : "Claim platform owner"}
            </Button>
          </div>
        ) : null}

        <Button variant="ghost" className="mt-6 w-full" onClick={signOut}>
          <LogOut className="size-4" /> Sign out
        </Button>
      </div>
    </div>
  );
}
