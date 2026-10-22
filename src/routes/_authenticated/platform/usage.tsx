import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/shared/ui";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchPlatformUsage } from "@/lib/queries";

// Super Admin usage overview. Structural counts come from agency-scoped rows;
// WhatsApp and AI usage comes from the current usage-counter period.

export const Route = createFileRoute("/_authenticated/platform/usage")({
  head: () => ({ meta: [{ title: "Usage — EstateOS" }] }),
  component: UsagePage,
});

function cell(used: number, limit: number | null) {
  if (limit === null) return <span className="text-muted-foreground">{used}</span>;
  if (limit === -1) return <span>{used} / unlimited</span>;
  if (limit === 0) return <span>{used} / none</span>;
  const atLimit = used >= limit;
  return (
    <span className={atLimit ? "font-medium text-amber-600 dark:text-amber-400" : undefined}>
      {used} / {limit}
      {atLimit ? " — at limit" : ""}
    </span>
  );
}

function UsagePage() {
  const { data, isLoading } = useQuery({
    queryKey: ["platform-usage"],
    queryFn: () => fetchPlatformUsage(),
  });

  if (isLoading) {
    return (
      <AppShell title="Usage" description="Platform-wide record counts per agency.">
        <Skeleton className="h-64 rounded-xl" />
      </AppShell>
    );
  }

  const rows = data ?? [];

  return (
    <AppShell title="Usage" description={`${rows.length} agencies · real row counts`}>
      <div className="mb-4 rounded-lg border border-border p-3 text-sm text-muted-foreground">
        <p>
          WhatsApp sends and AI requests are counted for the current subscription period (or the UTC
          calendar month for Free agencies) and reserved before provider calls. Failed provider
          attempts count toward limits. Storage is not metered.
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No agencies yet"
          description="Create an agency to start collecting usage."
          icon={BarChart3}
        />
      ) : (
        <div className="surface-panel overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agency</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Properties</TableHead>
                <TableHead>Leads</TableHead>
                <TableHead>Team members</TableHead>
                <TableHead>WhatsApp sends</TableHead>
                <TableHead>AI replies</TableHead>
                <TableHead>Site visits</TableHead>
                <TableHead>Photos &amp; videos</TableHead>
                <TableHead>Conversations</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.agencyId}>
                  <TableCell className="font-medium">{r.agencyName}</TableCell>
                  <TableCell>
                    {r.planName ?? <span className="text-muted-foreground">No plan</span>}
                  </TableCell>
                  <TableCell>{cell(r.properties, r.limits.properties)}</TableCell>
                  <TableCell>{cell(r.leads, r.limits.leads)}</TableCell>
                  <TableCell>{cell(r.teamMembers, r.limits.teamMembers)}</TableCell>
                  <TableCell>{cell(r.whatsappMessages, r.limits.whatsappMessages)}</TableCell>
                  <TableCell>{cell(r.aiRequests, r.limits.aiRequests)}</TableCell>
                  <TableCell>{r.siteVisits}</TableCell>
                  <TableCell>{r.media}</TableCell>
                  <TableCell>{r.conversations}</TableCell>
                  <TableCell>
                    <Link
                      to="/platform/agencies/$agencyId"
                      params={{ agencyId: r.agencyId }}
                      className="text-sm underline"
                    >
                      Open
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </AppShell>
  );
}
