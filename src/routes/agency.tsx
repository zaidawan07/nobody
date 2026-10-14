import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Building2, CalendarCheck, Home, MessageSquare, UserSquare2, ArrowUpRight } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/useAccess";

export const Route = createFileRoute("/agency")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
  },
  head: () => ({ meta: [{ title: "Agency overview — EstateOS" }] }),
  component: AgencyDashboard,
});

function AgencyDashboard() {
  const { data: access, isLoading: accessLoading } = useAccess();
  const metrics = [
    { key: "properties", label: "Properties", icon: Home, to: "/properties", table: "properties" as const, note: "Track active inventory" },
    { key: "leads", label: "Leads", icon: UserSquare2, to: "/leads", table: "leads" as const, note: "Keep follow-ups moving" },
    { key: "visits", label: "Site visits", icon: CalendarCheck, to: "/visits", table: "site_visits" as const, note: "Coordinate property viewings" },
    { key: "conversations", label: "Conversations", icon: MessageSquare, to: "/conversations", table: "conversations" as const, note: "Customer chats and handoffs" },
  ];
  const counts = useQuery({
    queryKey: ["agency-overview-counts"],
    queryFn: async () => {
      const results = await Promise.all(metrics.map(async (metric) => {
        const { count, error } = await supabase.from(metric.table).select("id", { count: "exact", head: true });
        if (error) throw error;
        return [metric.key, count ?? 0] as const;
      }));
      return Object.fromEntries(results) as Record<string, number>;
    },
  });

  return (
    <AppShell title="Agency overview" description="A live view of your team's property work and customer activity." actions={
      <Link to="/properties" className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">Add property <ArrowUpRight className="size-4" /></Link>
    }>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Good to see you{access?.fullName ? `, ${access.fullName}` : ""}.</p>
          <h2 className="mt-1 text-xl font-semibold">{access?.agencyName ?? (accessLoading ? "Loading your workspace…" : "Your workspace")}</h2>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground"><Building2 className="size-3.5" /> {access?.role?.replace("_", " ") ?? "Account"}</div>
      </div>
      {counts.isError ? <p role="alert" className="mb-5 rounded-lg bg-destructive/10 p-4 text-sm text-destructive">We couldn't load the workspace summary. Check your connection and access permissions, then refresh.</p> : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <Link key={metric.key} to={metric.to} className="surface-panel group p-5 transition hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-center justify-between"><span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><metric.icon className="size-5" /></span><ArrowUpRight className="size-4 text-muted-foreground transition group-hover:text-primary" /></div>
            <p className="mt-5 text-sm text-muted-foreground">{metric.label}</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums">{counts.isLoading ? "—" : counts.data?.[metric.key] ?? 0}</p>
            <p className="mt-2 text-xs text-muted-foreground">{metric.note}</p>
          </Link>
        ))}
      </div>
      <div className="surface-panel mt-6 flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div><h3 className="font-semibold">Build a reliable daily workflow</h3><p className="mt-1 text-sm text-muted-foreground">Keep property details current, respond to new leads, and confirm visits promptly.</p></div>
        <Link to="/leads" className="inline-flex h-10 items-center justify-center rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted">Review leads</Link>
      </div>
    </AppShell>
  );
}
