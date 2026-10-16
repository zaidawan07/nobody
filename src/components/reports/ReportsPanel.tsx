import { useQuery } from "@tanstack/react-query";
import { BarChart3, CalendarCheck, Home, TrendingUp, UserSquare2 } from "lucide-react";
import { EmptyState, StatCard, StatusBadge } from "@/components/shared/ui";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAccess } from "@/hooks/useAccess";
import { getLeadStatusLabel, titleCase } from "@/lib/format";
import { fetchReportSnapshot, type ReportCount, type ReportWeek } from "@/lib/queries";

// Reports for both route trees. There is one implementation on purpose: the
// numbers an employee sees are the same query an admin runs, narrowed by RLS.
// Re-deriving "only my rows" with a client filter here would be a second,
// weaker copy of a rule the database already enforces.

function pctOf(count: number, max: number): string {
  if (max <= 0) return "0%";
  return (count / max) * 100 + "%";
}

function BarList({
  title,
  caption,
  rows,
  showStatusBadge,
}: {
  title: string;
  caption?: string;
  rows: { key: string; label: string; count: number }[];
  showStatusBadge?: boolean;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <section className="surface-panel p-5">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {caption ? <p className="mt-1 text-xs text-muted-foreground">{caption}</p> : null}
      <ul className="mt-4 space-y-3">
        {rows.map((r) => (
          <li key={r.key}>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate">
                {showStatusBadge ? (
                  <StatusBadge status={r.key} />
                ) : (
                  <span className="text-foreground">{r.label}</span>
                )}
              </span>
              <span className="shrink-0 font-medium tabular-nums text-foreground">{r.count}</span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: pctOf(r.count, max) }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function WeeklyVisits({
  weeks,
  notInWindow,
  total,
}: {
  weeks: ReportWeek[];
  notInWindow: number;
  total: number;
}) {
  const max = Math.max(1, ...weeks.map((w) => w.count));
  return (
    <section className="surface-panel p-5">
      <h2 className="text-sm font-semibold text-foreground">Site visits per week</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Last 8 weeks, by the Monday of the week each visit was created. {total.toLocaleString()}{" "}
        total, all time
        {notInWindow > 0
          ? " -- " + notInWindow.toLocaleString() + " fall outside this window and are not charted."
          : "."}
      </p>
      <div className="mt-4 flex items-end gap-2">
        {weeks.map((w) => {
          const d = new Date(w.weekStart + "T00:00:00");
          const dayLabel = d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
          return (
            <div
              key={w.weekStart}
              className="flex flex-1 flex-col items-center gap-1"
              title={`Week of ${dayLabel}: ${w.count}`}
            >
              <span className="text-xs font-medium tabular-nums text-foreground">{w.count}</span>
              <div className="flex h-24 w-full items-end rounded bg-secondary">
                <div
                  className="w-full rounded bg-primary"
                  style={{ height: pctOf(w.count, max) }}
                />
              </div>
              <span className="text-[10px] leading-tight text-muted-foreground">{dayLabel}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Conversion({
  won,
  lost,
  open,
  conversion,
}: {
  won: number;
  lost: number;
  open: number;
  conversion: number | null;
}) {
  return (
    <section className="surface-panel p-5">
      <h2 className="text-sm font-semibold text-foreground">Conversion</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Converted divided by converted plus lost. Open leads are still in play and are left out of
        the rate but shown below.
      </p>
      <p className="mt-4 text-3xl font-semibold tabular-nums text-foreground">
        {conversion === null ? "—" : Math.round(conversion * 100) + "%"}
      </p>
      {conversion === null ? (
        <p className="mt-1 text-xs text-muted-foreground">
          No lead has been won or lost yet, so there is no rate to show.
        </p>
      ) : null}
      <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
        <div>
          <dt className="text-muted-foreground">Converted</dt>
          <dd className="font-medium tabular-nums text-foreground">{won.toLocaleString()}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Lost</dt>
          <dd className="font-medium tabular-nums text-foreground">{lost.toLocaleString()}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Still open</dt>
          <dd className="font-medium tabular-nums text-foreground">{open.toLocaleString()}</dd>
        </div>
      </dl>
    </section>
  );
}

export function ReportsPanel({ agencyId }: { agencyId: string }) {
  const { data: access } = useAccess();
  const role = access?.role ?? null;
  const userId = access?.userId ?? null;
  // An employee's own view is the employee route; everything else is the
  // agency-wide view. This decides grouping only -- RLS decides the rows.
  const selfScope = role === "employee";

  const { data, isLoading } = useQuery({
    queryKey: ["reports", agencyId, selfScope ? "self" : "agency", userId ?? "none"],
    enabled: Boolean(userId),
    queryFn: async () => {
      if (!userId) throw new Error("Not signed in.");
      return fetchReportSnapshot(
        agencyId,
        selfScope ? { kind: "self", userId } : { kind: "agency" },
      );
    },
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const nothingYet =
    data.leads.total === 0 && data.properties.total === 0 && data.visits.total === 0;

  if (nothingYet) {
    return (
      <EmptyState
        icon={BarChart3}
        title="Nothing to report yet"
        description={
          selfScope
            ? "Once leads, properties or visits are assigned to you, the numbers will appear here."
            : "Once the agency has leads, properties or site visits, the numbers will appear here."
        }
      />
    );
  }

  const leadRows = data.leads.byStatus.map((r: ReportCount) => ({
    key: r.key,
    label: getLeadStatusLabel(r.key),
    count: r.count,
  }));
  const propertyStatusRows = data.properties.byStatus.map((r) => ({
    key: r.key,
    label: titleCase(r.key),
    count: r.count,
  }));
  const propertyTypeRows = data.properties.byType.map((r) => ({
    key: r.key,
    label: titleCase(r.key),
    count: r.count,
  }));

  const workloadTitle = data.workload.complete ? "Team workload" : "Your workload";
  const workloadCaption = data.workload.complete
    ? "Every active member, plus anything nobody has picked up."
    : "Only the records you can see, counted for you.";

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Leads" value={data.leads.total} icon={UserSquare2} />
        <StatCard label="Properties" value={data.properties.total} icon={Home} />
        <StatCard label="Site visits" value={data.visits.total} icon={CalendarCheck} />
        <StatCard
          label="Conversion"
          value={
            data.leads.conversion === null ? "—" : Math.round(data.leads.conversion * 100) + "%"
          }
          icon={TrendingUp}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <BarList
          title="Leads by status"
          caption="Every pipeline stage, including the ones nothing has reached yet."
          rows={leadRows}
          showStatusBadge
        />
        <Conversion
          won={data.leads.won}
          lost={data.leads.lost}
          open={data.leads.open}
          conversion={data.leads.conversion}
        />
        <BarList
          title="Properties by status"
          caption="Counted with the same status values the property list uses."
          rows={propertyStatusRows}
          showStatusBadge
        />
        <BarList
          title="Properties by type"
          caption="What the agency actually stocks."
          rows={propertyTypeRows}
        />
      </div>

      <WeeklyVisits
        weeks={data.visits.weeks}
        notInWindow={data.visits.notInWindow}
        total={data.visits.total}
      />

      <section className="surface-panel overflow-x-auto">
        <div className="border-b border-border p-5">
          <h2 className="text-sm font-semibold text-foreground">{workloadTitle}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{workloadCaption}</p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead className="text-right">Leads</TableHead>
              <TableHead className="text-right">Properties</TableHead>
              <TableHead className="text-right">Site visits</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.workload.rows.map((r) => (
              <TableRow key={r.id ?? "unassigned"}>
                <TableCell className="font-medium text-foreground">{r.name}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {r.leads.toLocaleString()}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {r.properties.toLocaleString()}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {r.visits.toLocaleString()}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums text-foreground">
                  {(r.leads + r.properties + r.visits).toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
