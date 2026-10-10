import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CreditCard, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { EmptyState, StatusBadge } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchPlansSummary, fetchPlatformSubscriptions } from "@/lib/queries";
import { assignAgencyPlan, setSubscriptionStatus } from "@/lib/subscriptions.functions";
import { formatPkr } from "@/lib/format";

// Super Admin subscription management. Manual by design: there is no payment
// provider behind this table, so every status change here is an operator
// action, not a webhook side-effect. Reads go through the caller's own
// connection, so migration 0006's RLS still decides what is visible.

export const Route = createFileRoute("/_authenticated/platform/subscriptions")({
  head: () => ({ meta: [{ title: "Subscriptions — EstateOS" }] }),
  component: SubscriptionsPage,
});

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : "—";
}

function SubscriptionsPage() {
  const queryClient = useQueryClient();
  const [managing, setManaging] = useState<{ agencyId: string; agencyName: string } | null>(null);
  const [planId, setPlanId] = useState<string>("");
  const [trialDays, setTrialDays] = useState("0");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: rowsList, isLoading } = useQuery({
    queryKey: ["platform-subscriptions"],
    queryFn: () => fetchPlatformSubscriptions(),
  });
  const { data: plans } = useQuery({
    queryKey: ["plans-summary"],
    queryFn: () => fetchPlansSummary(),
  });

  const assign = useServerFn(assignAgencyPlan);
  const setStatus = useServerFn(setSubscriptionStatus);

  function openManage(row: { agencyId: string; agencyName: string; planId: string | null }) {
    setManaging({ agencyId: row.agencyId, agencyName: row.agencyName });
    setPlanId(row.planId ?? "");
    setTrialDays("0");
    setError(null);
  }

  async function onAssign() {
    if (!managing || !planId) return;
    setSaving(true);
    setError(null);
    try {
      await assign({
        data: { agencyId: managing.agencyId, planId, trialDays: Number(trialDays) || 0 },
      });
      toast.success(`${managing.agencyName}'s plan updated`);
      setManaging(null);
      await queryClient.invalidateQueries({ queryKey: ["platform-subscriptions"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the plan.");
    } finally {
      setSaving(false);
    }
  }

  async function onStatus(
    row: { agencyId: string; agencyName: string },
    status: "past_due" | "canceled" | "expired",
  ) {
    setError(null);
    try {
      await setStatus({ data: { agencyId: row.agencyId, status } });
      toast.success(`${row.agencyName} marked ${status}`);
      await queryClient.invalidateQueries({ queryKey: ["platform-subscriptions"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the status.");
    }
  }

  if (isLoading) {
    return (
      <AppShell title="Subscriptions" description="Per-agency billing and plan status.">
        <Skeleton className="h-64 rounded-xl" />
      </AppShell>
    );
  }

  const rows = rowsList ?? [];
  const withPlan = rows.filter((r) => r.subscriptionStatus !== null).length;

  return (
    <AppShell
      title="Subscriptions"
      description={`${rows.length} agencies · ${withPlan} with a plan on record`}
    >
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-border p-3 text-sm text-muted-foreground">
        <AlertCircle className="mt-0.5 size-4 shrink-0" />
        <p>
          There is <strong>no payment provider connected</strong>: every row here is maintained by
          hand. Assigning a plan writes a <code>subscriptions</code> row through your own
          connection, so migration 0006's super-admin RLS policy is enforced a second time.
        </p>
      </div>

      {error ? (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          title="No agencies yet"
          description="Create an agency first, then assign it a plan."
          icon={CreditCard}
        />
      ) : (
        <div className="surface-panel overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agency</TableHead>
                <TableHead>Agency status</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Subscription</TableHead>
                <TableHead>Trial ends</TableHead>
                <TableHead>Period ends</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.agencyId}>
                  <TableCell className="font-medium">{r.agencyName}</TableCell>
                  <TableCell>
                    <StatusBadge status={r.agencyStatus} />
                  </TableCell>
                  <TableCell>
                    {r.planName ?? <span className="text-muted-foreground">No plan assigned</span>}
                  </TableCell>
                  <TableCell>
                    {r.planPricePkr !== null
                      ? `${formatPkr(r.planPricePkr)} / ${r.planInterval ?? "month"}`
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {r.subscriptionStatus ? (
                      <StatusBadge status={r.subscriptionStatus} />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>{formatDate(r.trialEndsAt)}</TableCell>
                  <TableCell>{formatDate(r.periodEndsAt)}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => openManage(r)}>
                        Manage
                      </Button>
                      {r.subscriptionStatus && r.subscriptionStatus !== "canceled" ? (
                        <Button size="sm" variant="outline" onClick={() => onStatus(r, "canceled")}>
                          Cancel
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {managing ? (
        <Dialog open onOpenChange={(open) => !open && setManaging(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Manage {managing.agencyName}</DialogTitle>
              <DialogDescription>
                Assign a plan or start a trial. Limits are enforced immediately by the database.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="plan">
                  Plan
                </label>
                <Select value={planId} onValueChange={setPlanId}>
                  <SelectTrigger id="plan">
                    <SelectValue placeholder="Choose a plan" />
                  </SelectTrigger>
                  <SelectContent>
                    {(plans ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} — {formatPkr(p.price_pkr)}/{p.interval}
                        {p.is_active ? "" : " (inactive)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="trial">
                  Trial days (0 = none)
                </label>
                <Input
                  id="trial"
                  type="number"
                  min={0}
                  max={3650}
                  value={trialDays}
                  onChange={(e) => setTrialDays(e.target.value)}
                />
              </div>

              {error ? (
                <Alert variant="destructive">
                  <AlertCircle className="size-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setManaging(null)}>
                Close
              </Button>
              <Button disabled={saving || !planId} onClick={onAssign}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : "Assign plan"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </AppShell>
  );
}
