import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Home } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { EmptyState, StatusBadge } from "@/components/shared/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchProperties } from "@/lib/queries";
import { formatPkr, titleCase } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/employee/properties/")({
  head: () => ({ meta: [{ title: "My properties — EstateOS" }] }),
  component: EmployeePropertiesPage,
});

function EmployeePropertiesPage() {
  const { access } = Route.useRouteContext();
  const agencyId = access.agencyId!;

  const { data, isLoading } = useQuery({
    queryKey: ["properties", agencyId],
    queryFn: () => fetchProperties(agencyId),
  });

  return (
    <AppShell title="My properties" description="Properties assigned to you.">
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={Home}
          title="Nothing assigned yet"
          description="When your admin assigns you a property, it'll show up here."
        />
      ) : (
        <div className="surface-panel overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Property</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Price</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <Link
                      to="/employee/properties/$propertyId"
                      params={{ propertyId: p.id }}
                      className="block font-medium text-foreground"
                    >
                      {p.title}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {[p.city, titleCase(p.purpose)].filter(Boolean).join(" · ")}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{titleCase(p.property_type)}</TableCell>
                  <TableCell>
                    <StatusBadge status={p.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.price_pkr ? formatPkr(Number(p.price_pkr)) : "—"}
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
