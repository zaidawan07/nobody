"use client";

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  CheckCircle2,
  PauseCircle,
  Clock3,
  Plus,
  Users,
  BarChart3,
  AlertCircle,
  Settings,
  RefreshCw,
  Search,
  Filter,
  ChevronDown,
  ChevronRight,
  LucideIcon,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { EmptyState, StatusBadge } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { fetchPlatformStats, fetchAgencies } from "@/lib/queries";
import { formatPkr } from "@/lib/format";

type SortKey = "name" | "status" | "member_count" | "property_count" | "created_at";

function StatCard({
  label,
  value,
  icon: Icon,
  className,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  className?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="rounded-full bg-secondary p-2 text-secondary-foreground">
          <Icon className="size-4" />
        </div>
        <div>
          <p className={`text-2xl font-semibold tabular-nums ${className ?? ""}`}>{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function SuperAdminDashboard() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["platform-stats"],
    queryFn: fetchPlatformStats,
  });

  const { data: agencies, isLoading: agenciesLoading } = useQuery({
    queryKey: ["agencies"],
    queryFn: fetchAgencies,
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortKey>("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const filteredAgencies = (agencies ?? [])
    .filter((agency) => {
      if (searchQuery && !agency.name.toLowerCase().includes(searchQuery.toLowerCase()))
        return false;
      if (statusFilter !== "all" && agency.status !== statusFilter) return false;
      return true;
    })
    .sort((a, b) => {
      let aVal: string | number = a[sortBy] ?? "";
      let bVal: string | number = b[sortBy] ?? "";
      if (typeof aVal === "string") aVal = aVal.toLowerCase();
      if (typeof bVal === "string") bVal = bVal.toLowerCase();
      if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
      if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

  const handleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortOrder("asc");
    }
  };

  const SortableHeader = ({ label, sortKey }: { label: string; sortKey: SortKey }) => (
    <TableHead
      className="cursor-pointer select-none hover:bg-muted"
      onClick={() => handleSort(sortKey)}
    >
      <div className="flex items-center gap-1">
        {label}
        {sortBy === sortKey && <span className="text-xs">{sortOrder === "asc" ? "↑" : "↓"}</span>}
      </div>
    </TableHead>
  );

  return (
    <AppShell
      title="Platform overview"
      description="Every agency on EstateOS, at a glance."
      actions={
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search agencies..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-64 pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>
          <Button asChild size="sm" variant="outline">
            <Link to="/platform/agencies">
              <Plus className="size-4" /> New agency
            </Link>
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Stats Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="Total agencies" value={stats?.total ?? 0} icon={Building2} />
          <StatCard label="Active" value={stats?.active ?? 0} icon={CheckCircle2} />
          <StatCard
            label="Suspended"
            value={stats?.suspended ?? 0}
            icon={PauseCircle}
            className="text-destructive"
          />
          <StatCard label="Pending" value={stats?.pending ?? 0} icon={Clock3} />
          <StatCard
            label="Total users"
            value={agencies?.reduce((sum, a) => sum + (a.member_count ?? 0), 0) ?? 0}
            icon={Users}
          />
        </div>

        {/* Agency Directory */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Agency Directory</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  placeholder="Search agencies..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-64 pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchQuery("");
                  setStatusFilter("all");
                }}
              >
                <RefreshCw className="size-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {agenciesLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 rounded-lg" />
                ))}
              </div>
            ) : filteredAgencies.length === 0 ? (
              <EmptyState
                icon={Building2}
                title={
                  searchQuery || statusFilter !== "all" ? "No matching agencies" : "No agencies yet"
                }
                description={
                  searchQuery || statusFilter !== "all"
                    ? "Try adjusting your search or filters."
                    : "Create the first agency to start onboarding property teams onto EstateOS."
                }
                action={
                  <Button asChild className="mt-2">
                    <Link to="/platform/agencies">
                      <Plus className="size-4" /> Create an agency
                    </Link>
                  </Button>
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableHeader label="Agency" sortKey="name" />
                      <SortableHeader label="Status" sortKey="status" />
                      <SortableHeader label="Team" sortKey="member_count" />
                      <SortableHeader label="Properties" sortKey="property_count" />
                      <SortableHeader label="Created" sortKey="created_at" />
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAgencies.map((agency) => (
                      <TableRow key={agency.id} className="cursor-pointer">
                        <TableCell>
                          <Link
                            to="/platform/agencies/$agencyId"
                            params={{ agencyId: agency.id }}
                            className="block font-medium text-foreground hover:underline"
                          >
                            {agency.name}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={agency.status} />
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {agency.member_count ?? 0}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {agency.property_count ?? 0}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(agency.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Link to="/platform/agencies/$agencyId" params={{ agencyId: agency.id }}>
                            <ChevronRight className="size-4 text-muted-foreground" />
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
