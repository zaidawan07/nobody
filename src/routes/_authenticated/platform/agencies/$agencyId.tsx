import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Building2,
  PauseCircle,
  PlayCircle,
  Loader2,
  BarChart3,
  Wifi,
  Bot,
  MessageSquare,
  DollarSign,
  TrendingUp,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { StatusBadge, EmptyState } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CopyLinkButton } from "@/components/shared/CopyLinkButton";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchAgencyDetail } from "@/lib/queries";
import { setAgencyStatus, reissueFirstAdminLink } from "@/lib/provisioning.functions";
import { AgencyUsageOverview } from "@/components/platform/AgencyUsageOverview";

export const Route = createFileRoute("/_authenticated/platform/agencies/$agencyId")({
  head: () => ({ meta: [{ title: "Agency — EstateOS" }] }),
  component: AgencyDetailPage,
});

function AgencyDetailPage() {
  const { agencyId } = Route.useParams();
  const queryClient = useQueryClient();
  const updateStatus = useServerFn(setAgencyStatus);
  const reissueAdminLink = useServerFn(reissueFirstAdminLink);
  const [updating, setUpdating] = useState(false);
  const [reissuing, setReissuing] = useState<string | null>(null);
  const [freshLink, setFreshLink] = useState<{
    email: string;
    actionLink: string;
    emailSent: boolean;
  } | null>(null);

  const { data: agency, isLoading } = useQuery({
    queryKey: ["agency-detail", agencyId],
    queryFn: () => fetchAgencyDetail(agencyId),
  });

  async function reissue(profileId: string, email: string | null) {
    setReissuing(profileId);
    setFreshLink(null);
    try {
      const out = await reissueAdminLink({ data: { agencyId, profileId } });
      setFreshLink({
        email: email ?? "(no email)",
        actionLink: out.actionLink,
        emailSent: out.emailSent,
      });
      toast.success(out.emailSent ? "New link created and emailed" : "New link created");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create a new link.");
    } finally {
      setReissuing(null);
    }
  }

  async function toggleStatus() {
    if (!agency) return;
    const next = agency.status === "active" ? "suspended" : "active";
    setUpdating(true);
    try {
      await updateStatus({ data: { agencyId, status: next } });
      toast.success(next === "active" ? "Agency activated" : "Agency suspended");
      queryClient.invalidateQueries({ queryKey: ["agency-detail", agencyId] });
      queryClient.invalidateQueries({ queryKey: ["agencies"] });
      queryClient.invalidateQueries({ queryKey: ["platform-stats"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update the agency.");
    } finally {
      setUpdating(false);
    }
  }

  if (isLoading) {
    return (
      <AppShell title="Agency">
        <Skeleton className="h-40 rounded-xl" />
      </AppShell>
    );
  }

  if (!agency) {
    return (
      <AppShell title="Agency not found">
        <EmptyState
          icon={Building2}
          title="Agency not found"
          description="It may have been removed, or the link is wrong."
          action={
            <Button asChild variant="secondary" className="mt-2">
              <Link to="/platform/agencies">
                <ArrowLeft className="size-4" /> Back to agencies
              </Link>
            </Button>
          }
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      title={agency.name}
      description={
        [agency.cities_served.join(", "), agency.phone].filter(Boolean).join(" · ") || undefined
      }
      actions={
        <>
          <Button asChild variant="ghost" size="sm">
            <Link to="/platform/agencies">
              <ArrowLeft className="size-4" /> Back
            </Link>
          </Button>
          <Button
            size="sm"
            variant={agency.status === "active" ? "destructive" : "default"}
            onClick={toggleStatus}
            disabled={updating}
          >
            {updating ? (
              <Loader2 className="size-4 animate-spin" />
            ) : agency.status === "active" ? (
              <PauseCircle className="size-4" />
            ) : (
              <PlayCircle className="size-4" />
            )}
            {agency.status === "active" ? "Suspend agency" : "Activate agency"}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {/* Overview Stats */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="surface-panel p-5">
            <p className="text-sm text-muted-foreground">Status</p>
            <div className="mt-2">
              <StatusBadge status={agency.status} />
            </div>
          </div>
          <div className="surface-panel p-5">
            <p className="text-sm text-muted-foreground">Properties</p>
            <p className="mt-1 text-2xl font-semibold">{agency.propertyCount}</p>
          </div>
          <div className="surface-panel p-5">
            <p className="text-sm text-muted-foreground">Leads</p>
            <p className="mt-1 text-2xl font-semibold">{agency.leadCount}</p>
          </div>
        </div>

        {/* Usage Overview */}
        <AgencyUsageOverview agencyId={agencyId} />

        {/* Team Members */}
        <div className="surface-panel mt-6 overflow-x-auto">
          <div className="border-b border-border px-4 py-3">
            <p className="font-medium">Team ({agency.members.length})</p>
          </div>
          {agency.members.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Building2}
                title="No team members yet"
                description="This agency has no admin or employees linked yet."
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agency.members.map((m) => {
                  // Only a pending AGENCY ADMIN has no invitation row to resend
                  // from the team screen, so this is the one case this button
                  // exists for. Employees are handled by the team screen.
                  const canReissue = m.status === "pending" && m.role === "agency_admin";
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium text-foreground">
                        {m.full_name ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{m.email ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {m.role === "agency_admin"
                          ? "Admin"
                          : m.role === "employee"
                            ? "Employee"
                            : m.role === "super_admin"
                              ? "Platform owner"
                              : "—"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={m.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        {canReissue ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => reissue(m.id, m.email)}
                            disabled={reissuing === m.id}
                          >
                            {reissuing === m.id ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <RotateCcw className="size-4" />
                            )}
                            Re-issue link
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          {freshLink ? (
            <div className="border-t border-border p-4">
              <Alert>
                <AlertDescription className="space-y-2">
                  <p className="text-sm">
                    New sign-in link for {freshLink.email}.{" "}
                    {freshLink.emailSent
                      ? "It was also emailed."
                      : "No email was sent — copy it and share it yourself."}{" "}
                    It stops working when the project&apos;s Supabase Email OTP expiration runs out
                    (1 hour by default), so send it now.
                  </p>
                  <div className="flex gap-2">
                    <Input readOnly value={freshLink.actionLink} className="font-mono text-xs" />
                    <CopyLinkButton value={freshLink.actionLink} />
                  </div>
                </AlertDescription>
              </Alert>
            </div>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}
