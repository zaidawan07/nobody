import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Users, Plus, Loader2, AlertCircle, PauseCircle, PlayCircle } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { EmptyState, StatusBadge } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { fetchTeamMembers, type TeamMember } from "@/lib/queries";
import {
  inviteTeamMember,
  listInvitations,
  resendInvitation,
  revokeInvitation,
} from "@/lib/invitations.functions";
import { setMemberStatus } from "@/lib/provisioning.functions";

export const Route = createFileRoute("/_authenticated/agency/team")({
  head: () => ({ meta: [{ title: "Team — EstateOS" }] }),
  component: TeamPage,
});

// No password field: the invitee sets their own on /accept-invitation.
const schema = z.object({
  fullName: z.string().min(2, "Enter their name"),
  email: z.string().min(1, "Enter their email").email("Enter a valid email"),
  phone: z.string().optional(),
  jobTitle: z.string().optional(),
  role: z.enum(["agency_admin", "employee"]),
});

function TeamPage() {
  const { access } = Route.useRouteContext();
  const agencyId = access.agencyId!;
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const updateStatus = useServerFn(setMemberStatus);
  const [statusUpdating, setStatusUpdating] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["team-members", agencyId],
    queryFn: () => fetchTeamMembers(agencyId),
  });

  async function toggleStatus(member: TeamMember) {
    const next = member.status === "active" ? "suspended" : "active";
    setStatusUpdating(member.id);
    try {
      await updateStatus({ data: { profileId: member.id, status: next } });
      toast.success(
        `${member.full_name ?? "Member"} ${next === "active" ? "activated" : "deactivated"}`,
      );
      queryClient.invalidateQueries({ queryKey: ["team-members", agencyId] });
      queryClient.invalidateQueries({ queryKey: ["agency-stats", agencyId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update that member.");
    } finally {
      setStatusUpdating(null);
    }
  }

  return (
    <AppShell
      title="Team"
      description="Everyone with access to your agency."
      actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="size-4" /> Invite teammate
            </Button>
          </DialogTrigger>
          <InviteMemberDialog
            agencyId={agencyId}
            onInvited={() => {
              setOpen(false);
              queryClient.invalidateQueries({ queryKey: ["team-members", agencyId] });
              queryClient.invalidateQueries({ queryKey: ["agency-stats", agencyId] });
            }}
          />
        </Dialog>
      }
    >
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No teammates yet"
          description="Add your first employee to start assigning properties, leads, and visits."
          action={
            <Button className="mt-2" onClick={() => setOpen(true)}>
              <Plus className="size-4" /> Add employee
            </Button>
          }
        />
      ) : (
        <div className="surface-panel overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((member) => (
                <TableRow key={member.id}>
                  <TableCell className="font-medium text-foreground">
                    {member.full_name ?? "—"}
                    {member.job_title ? (
                      <span className="block text-xs font-normal text-muted-foreground">
                        {member.job_title}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {member.role ? <StatusBadge status={member.role} /> : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <span className="block">{member.email ?? "—"}</span>
                    <span className="block text-xs">{member.phone ?? ""}</span>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={member.status} />
                  </TableCell>
                  <TableCell>
                    {member.id === access.userId ? null : (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={statusUpdating === member.id}
                        onClick={() => toggleStatus(member)}
                        title={member.status === "active" ? "Deactivate" : "Activate"}
                      >
                        {statusUpdating === member.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : member.status === "active" ? (
                          <PauseCircle className="size-4" />
                        ) : (
                          <PlayCircle className="size-4" />
                        )}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <PendingInvites agencyId={agencyId} />
    </AppShell>
  );
}

type InviteResult = {
  actionLink: string;
  expiresAt: string;
  emailSent: boolean;
  emailError: string | null;
  role: "agency_admin" | "employee";
};

type InvitationRow = {
  id: string;
  email: string;
  full_name: string | null;
  role: "agency_admin" | "employee";
  status: "pending" | "accepted" | "revoked" | "expired";
  expires_at: string;
  accepted_at: string | null;
  last_sent_at: string | null;
  send_count: number;
  created_at: string;
};

const inviteRoleLabels: Record<string, string> = {
  agency_admin: "Admin",
  employee: "Employee",
};

/** Copy-to-clipboard button for a value that must never be shown in full. */
function CopyLinkButton({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          toast.success("Link copied");
          setTimeout(() => setDone(false), 2000);
        } catch {
          toast.error("Couldn't copy. Select the link and copy it manually.");
        }
      }}
    >
      {done ? <CheckCircle2 className="size-4" /> : "Copy"}
    </Button>
  );
}

function InviteMemberDialog({ agencyId, onInvited }: { agencyId: string; onInvited: () => void }) {
  const invite = useServerFn(inviteTeamMember);
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<InviteResult | null>(null);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: "", email: "", phone: "", jobTitle: "", role: "employee" },
  });

  async function onSubmit(values: z.infer<typeof schema>) {
    setFormError(null);
    try {
      const out = await invite({
        data: {
          fullName: values.fullName,
          email: values.email,
          phone: values.phone || undefined,
          jobTitle: values.jobTitle || undefined,
          role: values.role,
        },
      });
      setResult(out as InviteResult);
      toast.success("Invitation created");
      onInvited();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Couldn't create that invitation.");
    }
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Invite a teammate</DialogTitle>
        <DialogDescription>
          They will set their own password when they accept. You never see it, and you cannot invite
          a platform owner.
        </DialogDescription>
      </DialogHeader>

      {result ? (
        <div className="space-y-4">
          <Alert>
            <CheckCircle2 className="size-4" />
            <AlertDescription>
              Invitation created.{" "}
              {result.emailSent
                ? "An email was also sent."
                : "No email was sent — copy the link below and share it yourself (WhatsApp is fine)."}
            </AlertDescription>
          </Alert>

          {result.emailError ? (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>
                The email could not be sent ({result.emailError}), but the link below works.
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Invitation link</p>
            <div className="flex gap-2">
              <Input readOnly value={result.actionLink} className="font-mono text-xs" />
              <CopyLinkButton value={result.actionLink} />
            </div>
            <p className="text-xs text-muted-foreground">
              Expires {new Date(result.expiresAt).toLocaleString()}. You can resend or revoke it
              from the pending list below.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setResult(null)}>
              Invite someone else
            </Button>
          </DialogFooter>
        </div>
      ) : (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {formError ? (
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            ) : null}

            <FormField
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full name</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone (optional)</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="jobTitle"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Job title (optional)</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role</FormLabel>
                  <FormControl>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="employee">
                          Employee — sees only what is assigned
                        </SelectItem>
                        <SelectItem value="agency_admin">
                          Admin — sees everything in the agency
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  "Create invitation"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      )}
    </DialogContent>
  );
}

/** Pending invitations, with resend and revoke. */
function PendingInvites({ agencyId }: { agencyId: string }) {
  const qc = useQueryClient();
  const [freshLink, setFreshLink] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["invitations", agencyId],
    queryFn: () => listInvitations(),
  });

  const resend = useServerFn(resendInvitation);
  const revoke = useServerFn(revokeInvitation);

  async function onResend(id: string) {
    setBusy(id);
    try {
      const out = (await resend({ data: { invitationId: id } })) as {
        actionLink: string;
        emailSent: boolean;
      };
      setFreshLink(out.actionLink);
      toast.success(out.emailSent ? "Invitation resent by email" : "New link ready to copy");
      qc.invalidateQueries({ queryKey: ["invitations", agencyId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't resend that invitation.");
    } finally {
      setBusy(null);
    }
  }

  async function onRevoke(id: string) {
    setBusy(id);
    try {
      await revoke({ data: { invitationId: id } });
      toast.success("Invitation revoked");
      qc.invalidateQueries({ queryKey: ["invitations", agencyId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't revoke that invitation.");
    } finally {
      setBusy(null);
    }
  }

  const items = (data?.items ?? []) as InvitationRow[];
  const pending = items.filter((i) => i.status === "pending");
  const settled = items.filter((i) => i.status !== "pending");

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-foreground">Invitations</h2>

      {isLoading ? (
        <Skeleton className="h-16 rounded-lg" />
      ) : pending.length === 0 ? (
        <p className="text-sm text-muted-foreground">No pending invitations.</p>
      ) : (
        <div className="surface-panel divide-y">
          {pending.map((inv) => (
            <div key={inv.id} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{inv.email}</p>
                <p className="text-xs text-muted-foreground">
                  {inviteRoleLabels[inv.role] ?? inv.role}
                  {inv.full_name ? " · " + inv.full_name : ""} · expires{" "}
                  {new Date(inv.expires_at).toLocaleDateString()}
                  {inv.send_count > 1 ? " · sent " + inv.send_count + "x" : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onResend(inv.id)}
                  disabled={busy === inv.id}
                >
                  Resend
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onRevoke(inv.id)}
                  disabled={busy === inv.id}
                >
                  Revoke
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {freshLink ? (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <p className="text-xs font-medium text-muted-foreground">New invitation link</p>
          <div className="flex gap-2">
            <Input readOnly value={freshLink} className="font-mono text-xs" />
            <CopyLinkButton value={freshLink} />
          </div>
          <p className="text-xs text-muted-foreground">
            The previous link is now invalid. Copy this one instead.
          </p>
        </div>
      ) : null}

      {settled.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Past invitations</p>
          <ul className="space-y-1">
            {settled.slice(0, 8).map((inv) => (
              <li
                key={inv.id}
                className="flex items-center justify-between text-xs text-muted-foreground"
              >
                <span className="truncate">{inv.email}</span>
                <span>
                  {inv.status === "accepted"
                    ? "accepted" +
                      (inv.accepted_at ? " " + new Date(inv.accepted_at).toLocaleDateString() : "")
                    : inv.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
