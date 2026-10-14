import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { BadgeCheck, CreditCard, Crown, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/useAccess";
import { requestSubscriptionChange } from "@/lib/provisioning.functions";

function money(value: number | null | undefined) {
  if (value == null) return "Contact platform owner";
  if (value === 0) return "Free";
  return new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", maximumFractionDigits: 0 }).format(value);
}

function limitLabel(value: number | null | undefined) {
  return value == null ? "Unlimited" : value.toLocaleString("en-PK");
}

export const Route = createFileRoute("/billing")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
  },
  head: () => ({ meta: [{ title: "Plan & billing — EstateOS" }] }),
  component: BillingPage,
});

function BillingPage() {
  const access = useAccess();
  const client = useQueryClient();
  const submitPlanRequest = useServerFn(requestSubscriptionChange);
  const [note, setNote] = useState("");
  const [busyPlan, setBusyPlan] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const dayStart = useMemo(() => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  }, []);

  const subscription = useQuery({
    queryKey: ["agency-subscription", access.data?.agencyId],
    enabled: !!access.data?.agencyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("agency_subscriptions")
        .select("id,agency_id,plan_id,status,billing_cycle,current_period_start,current_period_end,trial_ends_at,cancel_at_period_end,provider")
        .eq("agency_id", access.data!.agencyId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const currentPlan = useQuery({
    queryKey: ["current-subscription-plan", subscription.data?.plan_id],
    enabled: !!subscription.data?.plan_id,
    queryFn: async () => {
      const { data, error } = await supabase.from("subscription_plans").select("*").eq("id", subscription.data!.plan_id).single();
      if (error) throw error;
      return data;
    },
  });
  const plans = useQuery({
    queryKey: ["available-subscription-plans"],
    queryFn: async () => {
      const { data, error } = await supabase.from("subscription_plans").select("*").eq("is_active", true).order("monthly_price_pkr", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data;
    },
  });
  const usage = useQuery({
    queryKey: ["billing-usage", access.data?.agencyId, dayStart],
    enabled: !!access.data?.agencyId,
    queryFn: async () => {
      const agencyId = access.data!.agencyId!;
      const [properties, leads, members, aiReplies] = await Promise.all([
        supabase.from("properties").select("id", { count: "exact", head: true }).eq("agency_id", agencyId),
        supabase.from("leads").select("id", { count: "exact", head: true }).eq("agency_id", agencyId),
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("agency_id", agencyId).neq("status", "suspended"),
        supabase.from("conversation_messages").select("id", { count: "exact", head: true }).eq("agency_id", agencyId).eq("sender", "ai").gte("created_at", dayStart),
      ]);
      const failed = [properties.error, leads.error, members.error, aiReplies.error].find(Boolean);
      if (failed) throw failed;
      return { properties: properties.count ?? 0, leads: leads.count ?? 0, members: members.count ?? 0, aiReplies: aiReplies.count ?? 0 };
    },
  });
  const request = useQuery({
    queryKey: ["subscription-change-request", access.data?.agencyId],
    enabled: access.data?.role === "agency_admin" && !!access.data?.agencyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("subscription_change_requests")
        .select("id,requested_plan_id,status,created_at,note")
        .eq("agency_id", access.data!.agencyId!)
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return data[0] ?? null;
    },
  });

  async function requestPlan(planId: string) {
    if (!access.data?.agencyId || !isAdmin) return;
    setBusyPlan(planId); setError(""); setMessage("");
    try {
      await submitPlanRequest({ data: { planId, note: note.trim() } });
      setMessage("Plan request submitted. The platform owner will review it; this does not charge you or change the plan yet.");
      setNote("");
      await client.invalidateQueries({ queryKey: ["subscription-change-request", access.data.agencyId] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not submit the plan request. Refresh and try again.");
    } finally {
      setBusyPlan("");
    }
  }

  const isAdmin = access.data?.role === "agency_admin";
  const currentPlanId = subscription.data?.plan_id;
  const pendingRequest = request.data?.status === "open";

  return (
    <AppShell title="Plan & billing" description="Review your current limits, monitor usage, and request a plan change. Payment checkout will be connected in the final API setup stage.">
      {subscription.isError || plans.isError || usage.isError ? <p role="alert" className="mb-5 rounded-lg bg-destructive/10 p-4 text-sm text-destructive">Billing information could not be loaded. Confirm the subscription migration has been applied to your staging database.</p> : null}
      <section className="surface-panel mb-6 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3"><span className="rounded-xl bg-primary/10 p-3 text-primary"><Crown className="size-6" /></span><div><p className="text-sm text-muted-foreground">Current plan</p><h2 className="mt-1 text-2xl font-semibold">{currentPlan.data?.name ?? (subscription.isLoading ? "Loading…" : "No plan found")}</h2><p className="mt-1 text-sm text-muted-foreground">{currentPlan.data?.description ?? "Your subscription determines inventory, lead, team, and AI reply limits."}</p></div></div>
          <div className="rounded-lg border border-border px-3 py-2 text-right"><p className="text-xs text-muted-foreground">Subscription status</p><p className="mt-1 text-sm font-semibold capitalize">{subscription.data?.status?.replace("_", " ") ?? "Unknown"}</p></div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Billing cycle</p><p className="mt-1 text-sm font-medium capitalize">{subscription.data?.billing_cycle ?? "—"}</p></div>
          <div className="rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Started</p><p className="mt-1 text-sm font-medium">{subscription.data?.current_period_start ? new Date(subscription.data.current_period_start).toLocaleDateString() : "—"}</p></div>
          <div className="rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Renews / ends</p><p className="mt-1 text-sm font-medium">{subscription.data?.current_period_end ? new Date(subscription.data.current_period_end).toLocaleDateString() : "No end date set"}</p></div>
        </div>
      </section>

      <section className="surface-panel mb-6 p-5">
        <div className="flex items-center gap-2"><ShieldCheck className="size-5 text-primary" /><h2 className="font-semibold">Usage & limits</h2></div>
        <p className="mt-1 text-sm text-muted-foreground">Property, lead, and team figures are current totals; AI replies are counted for today. The database enforces record limits during creation, and AI replies are capped by both plan allowance and server-side safety limits.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Properties", used: usage.data?.properties ?? 0, max: currentPlan.data?.max_properties ?? null },
            { label: "Leads", used: usage.data?.leads ?? 0, max: currentPlan.data?.max_leads ?? null },
            { label: "Team members", used: usage.data?.members ?? 0, max: currentPlan.data?.max_team_members ?? null },
            { label: "AI replies today", used: usage.data?.aiReplies ?? 0, max: currentPlan.data?.max_ai_replies_per_day ?? 0 },
          ].map((item) => {
            const percent = item.max == null ? 0 : item.max === 0 ? (item.used ? 100 : 0) : Math.min(100, Math.round(item.used / item.max * 100));
            return <div key={item.label} className="rounded-lg border border-border p-4"><div className="flex items-center justify-between gap-2"><span className="text-sm text-muted-foreground">{item.label}</span><span className="text-sm font-semibold tabular-nums">{item.used.toLocaleString("en-PK")} / {limitLabel(item.max)}</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className={percent >= 100 ? "h-full rounded-full bg-destructive" : "h-full rounded-full bg-primary"} style={{ width: percent + "%" }} /></div></div>;
          })}
        </div>
      </section>

      <section>
        <div className="mb-4"><h2 className="text-lg font-semibold">Available plans</h2><p className="mt-1 text-sm text-muted-foreground">Prices are configured by the platform owner. Paid-plan checkout is not active yet.</p></div>
        <div className="grid gap-4 lg:grid-cols-3">
          {(plans.data ?? []).map((plan) => {
            const isCurrent = plan.id === currentPlanId;
            return <article key={plan.id} className={isCurrent ? "surface-panel border-primary/50 p-5" : "surface-panel p-5"}>
              <div className="flex items-center justify-between gap-3"><h3 className="text-lg font-semibold">{plan.name}</h3>{isCurrent ? <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">Current</span> : null}</div>
              <p className="mt-2 min-h-10 text-sm text-muted-foreground">{plan.description}</p>
              <p className="mt-4 text-2xl font-semibold">{money(plan.monthly_price_pkr)}<span className="text-sm font-normal text-muted-foreground">{plan.monthly_price_pkr != null && plan.monthly_price_pkr > 0 ? " / month" : ""}</span></p>
              <p className="mt-1 text-xs text-muted-foreground">Annual: {money(plan.annual_price_pkr)}</p>
              <div className="mt-4 space-y-2 text-sm"><p>{limitLabel(plan.max_properties)} properties</p><p>{limitLabel(plan.max_leads)} leads</p><p>{limitLabel(plan.max_team_members)} team members</p><p>{plan.max_ai_replies_per_day.toLocaleString("en-PK")} AI replies/day</p></div>
              <ul className="mt-4 space-y-2 border-t border-border pt-4 text-sm">{plan.features.map((feature) => <li key={feature} className="flex gap-2"><BadgeCheck className="mt-0.5 size-4 shrink-0 text-primary" />{feature}</li>)}</ul>
              {isAdmin && !isCurrent ? <button type="button" onClick={() => void requestPlan(plan.id)} disabled={!!busyPlan || pendingRequest || !plan.is_active} className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold disabled:opacity-50"><CreditCard className="size-4" />{busyPlan === plan.id ? "Submitting…" : pendingRequest ? "Request pending" : "Request this plan"}</button> : null}
            </article>;
          })}
        </div>
        {isAdmin && !pendingRequest ? <div className="surface-panel mt-5 p-5"><label className="block space-y-1.5 text-sm font-medium">Note for the platform owner (optional)<textarea maxLength={1000} rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Tell us about your agency's expected usage or requirements." className="w-full rounded-lg border border-input bg-background px-3 py-2 font-normal" /></label></div> : null}
        {pendingRequest ? <p className="mt-4 rounded-lg bg-muted p-4 text-sm">Your plan change request is pending review. Submitted {request.data?.created_at ? new Date(request.data.created_at).toLocaleString() : ""}.</p> : null}
        {message ? <p role="status" className="mt-4 rounded-lg bg-primary/10 p-4 text-sm">{message}</p> : null}
        {error ? <p role="alert" className="mt-4 rounded-lg bg-destructive/10 p-4 text-sm text-destructive">{error}</p> : null}
      </section>
    </AppShell>
  );
}
