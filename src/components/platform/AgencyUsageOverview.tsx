"use client";

import { useQuery } from "@tanstack/react-query";
import { Building2, CreditCard, TrendingUp, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatPkr } from "@/lib/format";
import { fetchAgencyDetail, fetchAgencyStats, fetchAgencySubscription } from "@/lib/queries";

interface AgencyUsageOverviewProps {
  agencyId: string;
}

// Feature keys that map to a count this app actually computes. Everything
// else in plan_features has no counter behind it, so we say so instead of
// inventing a number.
const COUNTED_FEATURES = new Set(["properties", "leads", "team_members"]);

function limitLabel(limit: number | null): string {
  if (limit === null) return "Not set";
  if (limit === -1) return "Unlimited";
  return String(limit);
}

export function AgencyUsageOverview({ agencyId }: AgencyUsageOverviewProps) {
  const { data: agency, isLoading: agencyLoading } = useQuery({
    queryKey: ["agency-detail", agencyId],
    queryFn: () => fetchAgencyDetail(agencyId),
  });

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["agency-stats", agencyId],
    queryFn: () => fetchAgencyStats(agencyId),
  });

  const { data: subscription, isLoading: subscriptionLoading } = useQuery({
    queryKey: ["agency-subscription", agencyId],
    queryFn: () => fetchAgencySubscription(agencyId),
  });

  if (agencyLoading || statsLoading || subscriptionLoading) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="h-32 animate-pulse">
                  <CardContent />
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!agency) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Building2 className="size-12 mx-auto text-muted-foreground" />
          <p className="mt-2 text-muted-foreground">Agency not found</p>
        </CardContent>
      </Card>
    );
  }

  const counts: Record<string, number> = {
    properties: agency.propertyCount ?? 0,
    leads: agency.leadCount ?? 0,
    team_members: agency.members?.length ?? 0,
  };

  const features = subscription?.plan?.features ?? [];
  const limitRows = features.filter((f) => f.included && f.limit_value !== null);

  return (
    <div className="space-y-6">
      {/* Real counts only -- each one is a row count filtered by agency_id. */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="size-5" />
            Usage
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="surface-panel p-4 rounded-lg">
              <p className="text-sm text-muted-foreground">Total properties</p>
              <p className="mt-1 text-2xl font-bold">{agency.propertyCount ?? 0}</p>
            </div>
            <div className="surface-panel p-4 rounded-lg">
              <p className="text-sm text-muted-foreground">Total leads</p>
              <p className="mt-1 text-2xl font-bold">{agency.leadCount ?? 0}</p>
            </div>
            <div className="surface-panel p-4 rounded-lg">
              <p className="text-sm text-muted-foreground">Team members</p>
              <p className="mt-1 text-2xl font-bold">{agency.members?.length ?? 0}</p>
            </div>
            <div className="surface-panel p-4 rounded-lg">
              <p className="text-sm text-muted-foreground">Upcoming visits</p>
              <p className="mt-1 text-2xl font-bold">{stats?.upcomingVisits ?? 0}</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Sources: row counts for this agency from <code>properties</code>, <code>leads</code>,{" "}
            <code>profiles</code> (fetchAgencyDetail) and <code>site_visits</code> with status
            requested/confirmed (fetchAgencyStats). No estimated or sampled values.
          </p>
        </CardContent>
      </Card>

      {/* Subscription: whatever row -- if any -- exists in `subscriptions`. */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="size-5" />
            Plan &amp; subscription
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!subscription ? (
            <p className="text-sm text-muted-foreground">
              No subscription on record: this agency has no row in <code>subscriptions</code>.
              Nothing in the app writes that table, so no plan, price or period applies to them
              today.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm text-muted-foreground">Plan</p>
                  <p className="font-medium">
                    {subscription.plan
                      ? `${subscription.plan.name} (${formatPkr(subscription.plan.price_pkr)}/${subscription.plan.interval})`
                      : "Plan row missing"}
                  </p>
                </div>
                <Badge variant="secondary" className="capitalize">
                  {subscription.status}
                </Badge>
              </div>
              <div className="grid gap-4 sm:grid-cols-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Trial ends</p>
                  <p className="font-medium">
                    {subscription.trial_ends_at
                      ? new Date(subscription.trial_ends_at).toLocaleDateString()
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Period ends</p>
                  <p className="font-medium">
                    {subscription.current_period_end
                      ? new Date(subscription.current_period_end).toLocaleDateString()
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Canceled at</p>
                  <p className="font-medium">
                    {subscription.canceled_at
                      ? new Date(subscription.canceled_at).toLocaleDateString()
                      : "—"}
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Sources: <code>subscriptions.status</code>, <code>subscriptions.trial_ends_at</code>
                , <code>subscriptions.current_period_end</code>,{" "}
                <code>subscriptions.canceled_at</code> and the referenced <code>plans</code> row.
                Status is maintained by hand; no payment provider is connected.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* Configured limits vs the counts above -- explicitly not enforced. */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="size-5" />
            Plan limits
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!subscription?.plan ? (
            <p className="text-sm text-muted-foreground">
              No plan assigned, so there are no configured limits to show. Limits are defined per
              plan on the Plans page (<code>plan_features</code>).
            </p>
          ) : limitRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              This plan has no numeric limits configured (only yes/no features).
            </p>
          ) : (
            <div className="space-y-3">
              {limitRows.map((f) => {
                const actual = COUNTED_FEATURES.has(f.feature_key)
                  ? counts[f.feature_key]
                  : undefined;
                return (
                  <div
                    key={f.feature_key}
                    className="flex flex-wrap items-center justify-between gap-2 text-sm"
                  >
                    <span className="text-muted-foreground">{f.feature_key}</span>
                    <span className="font-medium">
                      {actual !== undefined
                        ? `${actual} / ${limitLabel(f.limit_value)}`
                        : limitLabel(f.limit_value)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          <Separator className="my-2" />

          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
            <strong>Not enforced.</strong> These limits come from{" "}
            <code>plan_features.limit_value</code> and are display-only: nothing server-side blocks
            creating more properties, leads or members, and
            <code> usage_counters</code> has no rows because no code writes to it. WhatsApp
            messages, AI requests and storage have no counter at all, so no number is shown for
            them.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
