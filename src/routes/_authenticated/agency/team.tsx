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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { fetchTeamMembers, type TeamMember } from "@/lib/queries";
import { addTeamMember, setMemberStatus } from "@/lib/provisioning.functions";

export const Route = createFileRoute("/_authenticated/agency/team")({
  head: () => ({ meta: [{ title: "Team — EstateOS" }] }),
  component: TeamPage,
});

const schema = z.object({
  fullName: z.string().min(2, "Enter their name"),
  email: z.string().min(1, "Enter their email").email("Enter a valid email"),
  phone: z.string().optional(),
  jobTitle: z.string().optional(),
  password: z.string().min(8, "At least 8 characters"),
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
      toast.success(`${member.full_name ?? "Member"} ${next === "active" ? "activated" : "deactivated"}`);
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
              <Plus className="size-4" /> Add employee
            </Button>
          </DialogTrigger>
          <AddMemberDialog
            agencyId={agencyId}
            onAdded={() => {
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
                      <span className="block text-xs font-normal text-muted-foreground">{member.job_title}</span>
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
    </AppShell>
  );
}

function AddMemberDialog({ agencyId, onAdded }: { agencyId: string; onAdded: () => void }) {
  const add = useServerFn(addTeamMember);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: "", email: "", phone: "", jobTitle: "", password: "" },
  });

  async function onSubmit(values: z.infer<typeof schema>) {
    setFormError(null);
    try {
      await add({ data: { ...values, role: "employee" } });
      toast.success(`${values.fullName} added`);
      form.reset();
      onAdded();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Couldn't add that employee.");
    }
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Add employee</DialogTitle>
        <DialogDescription>
          They'll sign in with this email and password{agencyId ? "" : ""}.
        </DialogDescription>
      </DialogHeader>

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
                  <FormLabel>Phone</FormLabel>
                  <FormControl>
                    <Input placeholder="Optional" {...field} />
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
                  <FormLabel>Job title</FormLabel>
                  <FormControl>
                    <Input placeholder="Optional" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <Input type="password" autoComplete="new-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <DialogFooter>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Adding…
                </>
              ) : (
                "Add employee"
              )}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </DialogContent>
  );
}
