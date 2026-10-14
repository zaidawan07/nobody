import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, CreditCard, RefreshCw, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/useAccess";
import { resolveSubscriptionRequest, updateSubscriptionPlan } from "@/lib/provisioning.functions";

function nullableNumber(form: FormData, name: string) {
  const raw = String(form.get(name) ?? "").trim();
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : Number.NaN;
}

function currency(value: number | null) {
  if (value == null) return "Not configured";
  if (value === 0) return "Free";
  return new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", maximumFractionDigits: 0 }).format(value);
}

export const Route = createFileRoute("/platform-billing")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    const { data: isSuperAdmin, error: roleError } = await supabase.rpc("is_super_admin");
    if (roleError || !isSuperAdmin) throw redirect({ to: "/agency" });
  },
  head: () => ({ meta: [{ title: "Platform plans & billing — EstateOS" }] }),
  component: PlatformBillingPage,
});

function PlatformBillingPage() {
  const access = useAccess();
  const client = useQueryClient();
  const updatePlan = useServerFn(updateSubscriptionPlan);
  const resolveRequest = useServerFn(resolveSubscriptionRequest);
  const [savingPlan, setSavingPlan] = useState("");
  const [resolvingRequest, setResolvingRequest] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const plans = useQuery({
    queryKey: ["platform-subscription-plans"],
    enabled: access.data?.role === "super_admin",
    queryFn: async () => {
      const { data, error } = await supabase.from("subscription_plans").select("*").order("monthly_price_pkr", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data;
    },
  });
  const agencies = useQuery({
    queryKey: ["platform-billing-agencies"],
    enabled: access.data?.role === "super_admin",
    queryFn: async () => {
      const { data, error } = await supabase.from("agencies").select("id,name,status").order("name");
      if (error) throw error;
      return data;
    },
  });
  const subscriptions = useQuery({
    queryKey: ["platform-agency-subscriptions"],
    enabled: access.data?.role === "super_admin",
    queryFn: async () => {
      const { data, error } = await supabase.from("agency_subscriptions").select("id,agency_id,plan_id,status,billing_cycle,current_period_start,current_period_end,provider").order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const requests = useQuery({
    queryKey: ["platform-subscription-requests"],
    enabled: access.data?.role === "super_admin",
    queryFn: async () => {
      const { data, error } = await supabase.from("subscription_change_requests").select("*").eq("status", "open").order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const planById = new Map((plans.data ?? []).map((plan) => [plan.id, plan]));
  const agencyById = new Map((agencies.data ?? []).map((agency) => [agency.id, agency]));
  const activeRequests = requests.data ?? [];

  async function savePlan(event: FormEvent<HTMLFormElement>, planId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const monthly = nullableNumber(form, "monthlyPricePkr");
    const annual = nullableNumber(form, "annualPricePkr");
    const properties = nullableNumber(form, "maxProperties");
    const leads = nullableNumber(form, "maxLeads");
    const members = nullableNumber(form, "maxTeamMembers");
    const ai = nullableNumber(form, "maxAiRepliesPerDay");
    if ([monthly, annual, properties, leads, members, ai].some((value) => typeof value === "number" && (!Number.isFinite(value) || !Number.isInteger(value) && [properties, leads, members, ai].includes(value)))) {
      setError("Enter valid non-negative prices and whole-number limits. Leave a limit blank for unlimited.");
      return;
    }
    if (members !== null && members < 1) { setError("Team member limits must be at least one or left blank."); return; }
    setSavingPlan(planId); setError(""); setNotice("");
    try {
      await updatePlan({ data: {
        planId,
        monthlyPricePkr: monthly,
        annualPricePkr: annual,
        maxProperties: properties,
        maxLeads: leads,
        maxTeamMembers: members,
        maxAiRepliesPerDay: ai ?? 0,
        isActive: plans.data?.find((plan) => plan.id === planId)?.code === "starter" ? true : form.get("isActive") === "on",
      } });
      setNotice("Plan settings saved.");
      await Promise.all([
        client.invalidateQueries({ queryKey: ["platform-subscription-plans"] }),
        client.invalidateQueries({ queryKey: ["available-subscription-plans"] }),
        client.invalidateQueries({ queryKey: ["current-subscription-plan"] }),
      ]);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not save the plan.");
    } finally {
      setSavingPlan("");
    }
  }

  async function resolve(requestId: string, decision: "approved" | "rejected") {
    setResolvingRequest(requestId); setError(""); setNotice("");
    try {
      await resolveRequest({ data: { requestId, decision } });
      setNotice(decision === "approved" ? "Plan request approved and subscription activated manually." : "Plan request rejected.");
      await Promise.all([
        client.invalidateQueries({ queryKey: ["platform-subscription-requests"] }),
        client.invalidateQueries({ queryKey: ["platform-agency-subscriptions"] }),
      ]);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not resolve the request.");
    } finally {
      setResolvingRequest("");
    }
  }

  return (
    <AppShell title="Platform plans & billing" description="Configure subscription pricing and limits, review upgrade requests, and manage agency plan assignments. Payment processing remains manual until the payment API is configured.">
      {plans.isError || agencies.isError || subscriptions.isError || requests.isError ? <p role="alert" className="mb-5 rounded-lg bg-destructive/10 p-4 text-sm text-destructive">Billing data could not be loaded. Confirm the subscription migration is applied in staging.</p> : null}
      {error ? <p role="alert" className="mb-4 rounded-lg bg-destructive/10 p-4 text-sm text-destructive">{error}</p> : null}
      {notice ? <p role="status" className="mb-4 rounded-lg bg-primary/10 p-4 text-sm">{notice}</p> : null}

      <section className="mb-8">
        <div className="mb-4 flex items-center gap-2"><CreditCard className="size-5 text-primary" /><h2 className="text-lg font-semibold">Plan catalogue</h2></div>
        <div className="grid gap-4 xl:grid-cols-3">
          {(plans.data ?? []).map((plan) => (
            <form key={plan.id} onSubmit={(event) => void savePlan(event, plan.id)} className="surface-panel space-y-4 p-5">
              <div className="flex items-start justify-between gap-3"><div><h3 className="text-lg font-semibold">{plan.name}</h3><p className="text-xs text-muted-foreground">{plan.code}</p></div><label className="flex items-center gap-2 text-xs"><input type="checkbox" name="isActive" defaultChecked={plan.is_active} disabled={plan.code === "starter"} className="size-4 accent-primary" />Active</label></div>
              <p className="text-sm text-muted-foreground">{plan.description}</p>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1 text-xs font-medium">Monthly PKR<input name="monthlyPricePkr" type="number" min="0" step="1" defaultValue={plan.monthly_price_pkr ?? ""} className="h-10 w-full rounded-lg border border-input bg-background px-2 text-sm font-normal" /></label>
                <label className="space-y-1 text-xs font-medium">Annual PKR<input name="annualPricePkr" type="number" min="0" step="1" defaultValue={plan.annual_price_pkr ?? ""} className="h-10 w-full rounded-lg border border-input bg-background px-2 text-sm font-normal" /></label>
                <label className="space-y-1 text-xs font-medium">Property limit<input name="maxProperties" type="number" min="0" step="1" defaultValue={plan.max_properties ?? ""} placeholder="Unlimited" className="h-10 w-full rounded-lg border border-input bg-background px-2 text-sm font-normal" /></label>
                <label className="space-y-1 text-xs font-medium">Lead limit<input name="maxLeads" type="number" min="0" step="1" defaultValue={plan.max_leads ?? ""} placeholder="Unlimited" className="h-10 w-full rounded-lg border border-input bg-background px-2 text-sm font-normal" /></label>
                <label className="space-y-1 text-xs font-medium">Team limit<input name="maxTeamMembers" type="number" min="1" step="1" defaultValue={plan.max_team_members ?? ""} placeholder="Unlimited" className="h-10 w-full rounded-lg border border-input bg-background px-2 text-sm font-normal" /></label>
                <label className="space-y-1 text-xs font-medium">AI replies / day<input name="maxAiRepliesPerDay" type="number" min="0" step="1" required defaultValue={plan.max_ai_replies_per_day} className="h-10 w-full rounded-lg border border-input bg-background px-2 text-sm font-normal" /></label>
              </div>
              <div className="border-t border-border pt-3"><p className="text-sm font-semibold">{currency(plan.monthly_price_pkr)} <span className="text-xs font-normal text-muted-foreground">per month</span></p><button type="submit" disabled={!!savingPlan} className="mt-3 h-10 w-full rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">{savingPlan === plan.id ? "Saving…" : "Save plan settings"}</button></div>
            </form>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <div className="mb-4 flex items-center gap-2"><RefreshCw className="size-5 text-primary" /><h2 className="text-lg font-semibold">Pending plan requests</h2><span className="rounded-full bg-muted px-2 py-0.5 text-xs">{activeRequests.length}</span></div>
        {activeRequests.length === 0 ? <div className="surface-panel p-6 text-sm text-muted-foreground">No open plan requests.</div> : <div className="space-y-3">{activeRequests.map((request) => {
          const agency = agencyById.get(request.agency_id);
          const plan = planById.get(request.requested_plan_id);
          return <article key={request.id} className="surface-panel flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between"><div><h3 className="font-semibold">{agency?.name ?? "Agency"} → {plan?.name ?? "Plan"}</h3><p className="mt-1 text-sm text-muted-foreground">{agency?.status ? "Agency status: " + agency.status : ""} · Requested {new Date(request.created_at).toLocaleString()}</p><p className="mt-2 text-sm">{request.note || "No note provided."}</p><p className="mt-1 text-xs text-muted-foreground">Displayed price: {plan ? currency(plan.monthly_price_pkr) : "Unknown"} / month. Approval is a manual activation, not a payment confirmation.</p></div><div className="flex shrink-0 gap-2"><button type="button" onClick={() => void resolve(request.id, "approved")} disabled={!!resolvingRequest || !plan?.is_active} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"><Check className="size-4" />{resolvingRequest === request.id ? "Saving…" : "Approve"}</button><button type="button" onClick={() => void resolve(request.id, "rejected")} disabled={!!resolvingRequest} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold disabled:opacity-50"><X className="size-4" />Reject</button></div></article>;
        })}</div>}
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold">Agency subscriptions</h2>
        <div className="surface-panel overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="border-b border-border bg-muted/40"><tr><th className="px-4 py-3 font-semibold">Agency</th><th className="px-4 py-3 font-semibold">Plan</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-4 py-3 font-semibold">Cycle</th><th className="px-4 py-3 font-semibold">Provider</th></tr></thead><tbody className="divide-y divide-border">{(subscriptions.data ?? []).map((item) => <tr key={item.id}><td className="px-4 py-3">{agencyById.get(item.agency_id)?.name ?? item.agency_id}</td><td className="px-4 py-3">{planById.get(item.plan_id)?.name ?? "Unknown plan"}</td><td className="px-4 py-3 capitalize">{item.status.replace("_", " ")}</td><td className="px-4 py-3 capitalize">{item.billing_cycle}</td><td className="px-4 py-3 capitalize">{item.provider}</td></tr>)}</tbody></table></div>
      </section>
    </AppShell>
  );
}
