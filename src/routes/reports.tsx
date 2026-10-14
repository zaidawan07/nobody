import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { BarChart3, CalendarCheck, Download, Home, TrendingUp, UserRound } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/useAccess";
import { downloadCsv, toCsv } from "@/lib/csv";

type Period = "30" | "90" | "365" | "all";

export const Route = createFileRoute("/reports")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
  },
  head: () => ({ meta: [{ title: "Reports — EstateOS" }] }),
  component: ReportsPage,
});

function ReportsPage() {
  const access = useAccess();
  const [period, setPeriod] = useState<Period>("30");
  const startDate = useMemo(() => {
    if (period === "all") return null;
    return new Date(Date.now() - Number(period) * 24 * 60 * 60 * 1000).toISOString();
  }, [period]);

  const properties = useQuery({
    queryKey: ["report-properties", access.data?.agencyId, period],
    enabled: !!access.data?.agencyId,
    queryFn: async () => {
      let query = supabase.from("properties").select("id,title,city,status,purpose,price_pkr,created_at").order("created_at", { ascending: false });
      if (startDate) query = query.gte("created_at", startDate);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
  const leads = useQuery({
    queryKey: ["report-leads", access.data?.agencyId, period],
    enabled: !!access.data?.agencyId,
    queryFn: async () => {
      let query = supabase.from("leads").select("id,name,phone,city,status,budget_min_pkr,budget_max_pkr,created_at").order("created_at", { ascending: false });
      if (startDate) query = query.gte("created_at", startDate);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
  const visits = useQuery({
    queryKey: ["report-visits", access.data?.agencyId, period],
    enabled: !!access.data?.agencyId,
    queryFn: async () => {
      let query = supabase.from("site_visits").select("id,scheduled_at,status,confirmed,notes,created_at").order("scheduled_at", { ascending: false });
      if (startDate) query = query.gte("created_at", startDate);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const propertyRows = properties.data ?? [];
  const leadRows = leads.data ?? [];
  const visitRows = visits.data ?? [];
  const isLoading = properties.isLoading || leads.isLoading || visits.isLoading;
  const error = properties.error || leads.error || visits.error;
  const available = propertyRows.filter((row) => row.status === "available").length;
  const activeLeads = leadRows.filter((row) => !["won", "lost"].includes(row.status)).length;
  const wonLeads = leadRows.filter((row) => row.status === "won").length;
  const conversion = leadRows.length ? Math.round((wonLeads / leadRows.length) * 100) : 0;
  const upcomingVisits = visitRows.filter((row) => row.scheduled_at && new Date(row.scheduled_at).getTime() >= Date.now() && !["cancelled", "completed", "no_show"].includes(row.status)).length;

  function exportProperties() {
    downloadCsv("estateos-properties.csv", toCsv(propertyRows.map((row) => ({
      title: row.title, city: row.city, status: row.status, purpose: row.purpose, price_pkr: row.price_pkr, created_at: row.created_at,
    })), [
      { key: "title", label: "Property" }, { key: "city", label: "City" }, { key: "status", label: "Status" },
      { key: "purpose", label: "Purpose" }, { key: "price_pkr", label: "Price (PKR)" }, { key: "created_at", label: "Created at" },
    ]));
  }
  function exportLeads() {
    downloadCsv("estateos-leads.csv", toCsv(leadRows.map((row) => ({
      name: row.name, phone: row.phone, city: row.city, status: row.status,
      budget_min_pkr: row.budget_min_pkr, budget_max_pkr: row.budget_max_pkr, created_at: row.created_at,
    })), [
      { key: "name", label: "Lead name" }, { key: "phone", label: "Phone" }, { key: "city", label: "City" },
      { key: "status", label: "Status" }, { key: "budget_min_pkr", label: "Minimum budget (PKR)" },
      { key: "budget_max_pkr", label: "Maximum budget (PKR)" }, { key: "created_at", label: "Created at" },
    ]));
  }
  function exportVisits() {
    downloadCsv("estateos-site-visits.csv", toCsv(visitRows.map((row) => ({
      scheduled_at: row.scheduled_at, status: row.status, confirmed: row.confirmed, notes: row.notes, created_at: row.created_at,
    })), [
      { key: "scheduled_at", label: "Scheduled at" }, { key: "status", label: "Status" },
      { key: "confirmed", label: "Confirmed" }, { key: "notes", label: "Notes" }, { key: "created_at", label: "Created at" },
    ]));
  }

  const cards = [
    { label: "Properties added", value: propertyRows.length, note: `${available} currently available`, icon: Home },
    { label: "Active leads", value: activeLeads, note: `${leadRows.length} leads in this period`, icon: UserRound },
    { label: "Lead conversion", value: `${conversion}%`, note: `${wonLeads} marked won`, icon: TrendingUp },
    { label: "Upcoming visits", value: upcomingVisits, note: "Scheduled and not completed", icon: CalendarCheck },
  ];

  return (
    <AppShell title="Reports & exports" description="Review agency activity and download spreadsheet-ready reports. Data is limited by your signed-in agency permissions.">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-3 text-sm font-medium">
          Reporting period
          <select value={period} onChange={(event) => setPeriod(event.target.value as Period)} className="h-10 rounded-lg border border-input bg-background px-3">
            <option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last 12 months</option><option value="all">All time</option>
          </select>
        </label>
        <p className="text-xs text-muted-foreground">{period === "all" ? "Showing all available records" : `Since ${new Date(startDate!).toLocaleDateString()}`}</p>
      </div>
      {error ? <p role="alert" className="mb-5 rounded-lg bg-destructive/10 p-4 text-sm text-destructive">Reports could not be loaded. Check your connection and access permissions, then refresh.</p> : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <section key={card.label} className="surface-panel p-5">
            <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">{card.label}</span><card.icon className="size-5 text-primary" /></div>
            <p className="mt-4 text-3xl font-semibold tabular-nums">{isLoading ? "—" : card.value}</p>
            <p className="mt-2 text-xs text-muted-foreground">{card.note}</p>
          </section>
        ))}
      </div>
      <section className="surface-panel mt-6 p-5">
        <div className="flex items-start gap-3"><span className="rounded-lg bg-primary/10 p-2 text-primary"><BarChart3 className="size-5" /></span><div><h2 className="font-semibold">Export your reports</h2><p className="mt-1 text-sm text-muted-foreground">CSV files open in Excel, Google Sheets and other spreadsheet apps. Exports contain the selected period and only records visible to your account.</p></div></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <button type="button" onClick={exportProperties} disabled={isLoading || propertyRows.length === 0} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"><Download className="size-4" /> Properties ({propertyRows.length})</button>
          <button type="button" onClick={exportLeads} disabled={isLoading || leadRows.length === 0} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"><Download className="size-4" /> Leads ({leadRows.length})</button>
          <button type="button" onClick={exportVisits} disabled={isLoading || visitRows.length === 0} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"><Download className="size-4" /> Site visits ({visitRows.length})</button>
        </div>
        {!isLoading && propertyRows.length + leadRows.length + visitRows.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">No records were found for this period. Choose a wider period or add activity to your workspace.</p> : null}
      </section>
    </AppShell>
  );
}
