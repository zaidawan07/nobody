import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CreditCard, AlertCircle, CheckCircle2 } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { fetchAgencySubscription } from "@/lib/queries";
import { formatPkr } from "@/lib/format";

// Agency Admin view of their own plan. Read-only: there is no payment provider
// and no self-service plan change, so the only actor here is the platform
// owner. All three counts are real row counts and all three limits are the
// ones migration 0008 actually enforces.

export const Route = createFileRoute("/_authenticated/agency/subscription")({
  head: () => ({ meta: [{ title: "Subscription — EstateOS" }] }),
  component: SubscriptionPage,
});

const LIMITS: { key: string; label: string }[] = [
  { key: "properties", label: "Properties" },
  { key: "leads", label: "Leads" },
  { key: "team_members", label: "Team members" },
];

function formatDate(v: string | null) {
  return v ? new Date(v).toLocaleDateString() : "—";
}

function SubscriptionPage() {
  const { access } = Route.useRouteContext();
  const agencyId = access.agencyId!;

  const { data: subscription, isLoading } = useQuery({
    queryKey: ["agency-subscription", agencyId],
    queryFn: () => fetchAgencySubscription(agencyId),
  });

  const { data: counts, isLoading: countsLoading } = useQuery({
    queryKey: ["agency-own-usage", agencyId],
    queryFn: async (): Promise<Record<string, { count: number | null; limit: number | null }>> => {
      const out: Record<string, { count: number | null; limit: number | null }> = {};
      await Promise.all(
        LIMITS.map(async ({ key }) => {
          const [countRes, limitRes] = await Promise.all([
            supabase.rpc("count_agency_metric", { _agency_id: agencyId, _metric_key: key }),
            supabase.rpc("plan_limit_for_agency", { _agency_id: agencyId, _metric_key: key }),
          ]);
          if (countRes.error) throw countRes.error;
          if (limitRes.error) throw limitRes.error;
          out[key] = {
            count: typeof countRes.data === "number" ? countRes.data : null,
            limit: typeof limitRes.data === "number" ? limitRes.data : null,
          };
        }),
      );
      return out;
    },
  });

  if (isLoading || countsLoading) {
    return (
      <AppShell title="Subscription" description="Your agency's plan and usage.">
        <Skeleton className="h-64 rounded-xl" />
      </AppShell>
    );
  }

  const plan = subscription?.plan;
  const isActive = subscription ? ["trialing", "active"].includes(subscription.status) : false;

  return (
    <AppShell title="Subscription" description="Your agency's plan and usage.">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="size-5" />
              Current plan
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!subscription || !plan ? (
              <Alert>
                <AlertCircle className="size-4" />
                <AlertDescription>
                  This agency has no subscription on record, so no plan or limit applies. The
                  platform owner assigns plans from <strong>Platform → Subscriptions</strong>.
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-2xl font-semibold">{plan.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatPkr(plan.price_pkr)} per {plan.interval}
                    </p>
                  </div>
                  <Badge variant={isActive ? "default" : "secondary"} className="capitalize">
                    {subscription.status}
                  </Badge>
                </div>

                <div className="grid gap-4 sm:grid-cols-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">Trial ends</p>
                    <p className="font-medium">{formatDate(subscription.trial_ends_at)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Period ends</p>
                    <p className="font-medium">{formatDate(subscription.current_period_end)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Canceled</p>
                    <p className="font-medium">{formatDate(subscription.canceled_at)}</p>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Usage and limits</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              {LIMITS.map(({ key, label }, i) => {
                const entry = counts?.[key];
                const used = entry?.count ?? 0;
                const limit = entry?.limit ?? null;
                const unlimited = limit === null || limit < 0;
                const atLimit = limit !== null && limit > 0 && used >= limit;
                return (
                  <div key={key}>
                    {i > 0 ? <Separator className="mb-3" /> : null}
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="text-muted-foreground">{label}</span>
                      <span
                        className={
                          atLimit ? "font-medium text-amber-600 dark:text-amber-400" : "font-medium"
                        }
                      >
                        {used} {unlimited ? "used" : `of ${limit}`}
                        {limit === 0 ? " — not available on this plan" : ""}
                        {atLimit ? " — at limit" : ""}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <Alert variant={isActive ? "default" : "destructive"}>
              {isActive ? <CheckCircle2 className="size-4" /> : <AlertCircle className="size-4" />}
              <AlertDescription>
                {isActive
                  ? "Your plan is active. These limits are enforced by the database: a create that would exceed one is rejected."
                  : "Your plan is not currently active. Existing data is untouched, but the limits above still apply to new records — contact the platform owner."}
              </AlertDescription>
            </Alert>

            <p className="text-xs text-muted-foreground">
              WhatsApp messages, AI requests and storage are not counted: no code writes to{" "}
              <code>usage_counters</code>, so no figure is shown. There is no payment provider
              connected — plan changes are made by the platform owner, not here.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
