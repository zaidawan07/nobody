import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Plus, ChevronRight } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { CreateAgencyDialog } from "@/components/platform/CreateAgencyDialog";
import { fetchAgencies } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/platform/agencies/")({
  head: () => ({ meta: [{ title: "Agencies — EstateOS" }] }),
  component: AgenciesPage,
});

type SortKey = "name" | "status" | "member_count" | "property_count" | "created_at";

const PAGE_SIZE = 10;

function AgenciesPage() {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortKey>("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ["agencies"], queryFn: () => fetchAgencies() });

  const filteredAgencies = (data ?? [])
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

  const totalPages = Math.max(1, Math.ceil(filteredAgencies.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedAgencies = filteredAgencies.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  return (
    <AppShell
      title="Agencies"
      description="Every agency provisioned on this platform."
      actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="size-4" /> Add agency
            </Button>
          </DialogTrigger>
          <CreateAgencyDialog
            onCreated={() => {
              setOpen(false);
              queryClient.invalidateQueries({ queryKey: ["agencies"] });
              queryClient.invalidateQueries({ queryKey: ["platform-stats"] });
            }}
          />
        </Dialog>
      }
    >
      <div className="surface-panel mb-4 flex flex-wrap items-center gap-2 p-3">
        <Input
          placeholder="Search agencies..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setPage(1);
          }}
          className="w-full sm:w-64"
        />
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-32">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={sortBy}
          onValueChange={(v) => {
            setSortBy(v as SortKey);
            setSortOrder("asc");
          }}
        >
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Name</SelectItem>
            <SelectItem value="status">Status</SelectItem>
            <SelectItem value="member_count">Team</SelectItem>
            <SelectItem value="property_count">Properties</SelectItem>
            <SelectItem value="created_at">Created</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={sortOrder}
          onValueChange={(v) => {
            setSortOrder(v as "asc" | "desc");
          }}
        >
          <SelectTrigger className="w-24">
            <SelectValue placeholder="Order" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="asc">Ascending</SelectItem>
            <SelectItem value="desc">Descending</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : filteredAgencies.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={searchQuery || statusFilter !== "all" ? "No matching agencies" : "No agencies yet"}
          description={
            searchQuery || statusFilter !== "all"
              ? "Try adjusting your search or filters."
              : "Create the first agency to start onboarding property teams onto EstateOS."
          }
          action={
            <Button size="sm" className="mt-2" onClick={() => setOpen(true)}>
              <Plus className="size-4" />{" "}
              {searchQuery || statusFilter !== "all" ? "Clear filters" : "Add your first agency"}
            </Button>
          }
        />
      ) : (
        <>
          <div className="surface-panel overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <th scope="col">
                    <button
                      type="button"
                      className="flex items-center gap-1 text-left font-medium hover:bg-muted p-2 rounded"
                      onClick={() => {
                        if (sortBy === "name") {
                          if (sortOrder === "asc") {
                            setSortOrder("desc");
                          } else {
                            setSortOrder("asc");
                          }
                        } else {
                          setSortBy("name");
                          setSortOrder("asc");
                        }
                      }}
                    >
                      Agency
                      {sortBy === "name" && (
                        <span className="text-xs">{sortOrder === "asc" ? "↑" : "↓"}</span>
                      )}
                    </button>
                  </th>
                  <th scope="col">
                    <button
                      type="button"
                      className="flex items-center gap-1 text-left font-medium hover:bg-muted p-2 rounded"
                      onClick={() => {
                        if (sortBy === "status") {
                          if (sortOrder === "asc") {
                            setSortOrder("desc");
                          } else {
                            setSortOrder("asc");
                          }
                        } else {
                          setSortBy("status");
                          setSortOrder("asc");
                        }
                      }}
                    >
                      Status
                      {sortBy === "status" && (
                        <span className="text-xs">{sortOrder === "asc" ? "↑" : "↓"}</span>
                      )}
                    </button>
                  </th>
                  <th scope="col">
                    <button
                      type="button"
                      className="flex items-center gap-1 text-left font-medium hover:bg-muted p-2 rounded"
                      onClick={() => {
                        if (sortBy === "member_count") {
                          if (sortOrder === "asc") {
                            setSortOrder("desc");
                          } else {
                            setSortOrder("asc");
                          }
                        } else {
                          setSortBy("member_count");
                          setSortOrder("asc");
                        }
                      }}
                    >
                      Team
                      {sortBy === "member_count" && (
                        <span className="text-xs">{sortOrder === "asc" ? "↑" : "↓"}</span>
                      )}
                    </button>
                  </th>
                  <th scope="col">
                    <button
                      type="button"
                      className="flex items-center gap-1 text-left font-medium hover:bg-muted p-2 rounded"
                      onClick={() => {
                        if (sortBy === "property_count") {
                          if (sortOrder === "asc") {
                            setSortOrder("desc");
                          } else {
                            setSortOrder("asc");
                          }
                        } else {
                          setSortBy("property_count");
                          setSortOrder("asc");
                        }
                      }}
                    >
                      Properties
                      {sortBy === "property_count" && (
                        <span className="text-xs">{sortOrder === "asc" ? "↑" : "↓"}</span>
                      )}
                    </button>
                  </th>
                  <th scope="col">
                    <button
                      type="button"
                      className="flex items-center gap-1 text-left font-medium hover:bg-muted p-2 rounded"
                      onClick={() => {
                        if (sortBy === "created_at") {
                          if (sortOrder === "asc") {
                            setSortOrder("desc");
                          } else {
                            setSortOrder("asc");
                          }
                        } else {
                          setSortBy("created_at");
                          setSortOrder("asc");
                        }
                      }}
                    >
                      Created
                      {sortBy === "created_at" && (
                        <span className="text-xs">{sortOrder === "asc" ? "↑" : "↓"}</span>
                      )}
                    </button>
                  </th>
                  <th scope="col" className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedAgencies.map((agency) => (
                  <TableRow key={agency.id} className="cursor-pointer">
                    <TableCell>
                      <Link
                        to="/platform/agencies/$agencyId"
                        params={{ agencyId: agency.id }}
                        className="block font-medium text-foreground"
                      >
                        {agency.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1">
                        <span
                          className={`w-2 h-2 rounded-full ${agency.status === "active" ? "bg-green-500" : agency.status === "suspended" ? "bg-red-500" : "bg-yellow-500"}`}
                        />
                        <span className="capitalize">{agency.status}</span>
                      </span>
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

          <div className="mt-3 flex items-center justify-between text-sm">
            <span>
              {filteredAgencies.length} agenc{filteredAgencies.length === 1 ? "y" : "ies"}
              {totalPages > 1 ? ` · page ${currentPage} of ${totalPages}` : ""}
            </span>
            <div className="flex gap-1">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
              >
                Prev
              </Button>
              <span className="flex items-center px-2">
                {currentPage} / {totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}
