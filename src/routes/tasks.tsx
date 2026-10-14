import { useMemo, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { CalendarClock, CheckCircle2, ClipboardList, Plus, Search } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/useAccess";
import type { Database } from "@/integrations/supabase/types";

type TaskStatus = "open" | "in_progress" | "completed" | "cancelled";
type TaskPriority = "low" | "normal" | "high" | "urgent";
type TaskRow = Database["public"]["Tables"]["agency_tasks"]["Row"];
const statuses: TaskStatus[] = ["open", "in_progress", "completed", "cancelled"];
const priorities: TaskPriority[] = ["low", "normal", "high", "urgent"];

function localDateTime(value: string | null) {
  if (!value) return "No due date";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "No due date" : date.toLocaleString();
}

export const Route = createFileRoute("/tasks")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
  },
  head: () => ({ meta: [{ title: "Follow-up tasks — EstateOS" }] }),
  component: TasksPage,
});

function TasksPage() {
  const access = useAccess();
  const client = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [assignedTo, setAssignedTo] = useState("");
  const [leadId, setLeadId] = useState("");
  const [propertyId, setPropertyId] = useState("");

  const tasks = useQuery({
    queryKey: ["agency-tasks", access.data?.agencyId],
    enabled: !!access.data?.agencyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("agency_tasks").select("*").order("due_at", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const references = useQuery({
    queryKey: ["task-references", access.data?.agencyId],
    enabled: !!access.data?.agencyId,
    queryFn: async () => {
      const [profiles, leads, properties] = await Promise.all([
        supabase.from("profiles").select("id,full_name,phone").eq("agency_id", access.data!.agencyId!),
        supabase.from("leads").select("id,name,preferred_city"),
        supabase.from("properties").select("id,title,city"),
      ]);
      if (profiles.error) throw profiles.error;
      if (leads.error) throw leads.error;
      if (properties.error) throw properties.error;
      return { profiles: profiles.data, leads: leads.data, properties: properties.data };
    },
  });

  const teammates = new Map((references.data?.profiles ?? []).map((item) => [item.id, item.full_name || item.phone || "Team member"]));
  const leadLabels = new Map((references.data?.leads ?? []).map((item) => [item.id, [item.name || "Lead", item.preferred_city].filter(Boolean).join(" · ")]));
  const propertyLabels = new Map((references.data?.properties ?? []).map((item) => [item.id, [item.title, item.city].filter(Boolean).join(" · ")]));
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return (tasks.data ?? []).filter((task) => {
      if (statusFilter !== "all" && task.status !== statusFilter) return false;
      if (!term) return true;
      const text = [task.title, task.description, task.priority, task.status, task.lead_id ? leadLabels.get(task.lead_id) : "", task.property_id ? propertyLabels.get(task.property_id) : ""].filter(Boolean).join(" ").toLocaleLowerCase();
      return text.includes(term);
    });
  }, [tasks.data, statusFilter, search, references.data]);

  async function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!access.data?.agencyId || title.trim().length < 2) return;
    setBusy(true);
    setError("");
    try {
      const { error } = await supabase.from("agency_tasks").insert({
        agency_id: access.data.agencyId,
        title: title.trim(),
        description: description.trim() || null,
        due_at: dueAt ? new Date(dueAt).toISOString() : null,
        priority,
        assigned_to: assignedTo || null,
        lead_id: leadId || null,
        property_id: propertyId || null,
      });
      if (error) throw error;
      setTitle(""); setDescription(""); setDueAt(""); setPriority("normal"); setAssignedTo(""); setLeadId(""); setPropertyId(""); setShowForm(false);
      await client.invalidateQueries({ queryKey: ["agency-tasks", access.data.agencyId] });
    } catch {
      setError("Could not create the task. Verify your access and make sure the selected lead, property, and teammate belong to this agency.");
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(task: TaskRow, status: TaskStatus) {
    setError("");
    const { error } = await supabase.from("agency_tasks").update({ status }).eq("id", task.id);
    if (error) {
      setError("Could not update this task. Refresh and try again.");
      return;
    }
    await client.invalidateQueries({ queryKey: ["agency-tasks", access.data?.agencyId] });
  }

  const openCount = (tasks.data ?? []).filter((task) => task.status === "open" || task.status === "in_progress").length;
  const overdueCount = (tasks.data ?? []).filter((task) => task.due_at && new Date(task.due_at).getTime() < Date.now() && task.status !== "completed" && task.status !== "cancelled").length;

  return (
    <AppShell title="Follow-up tasks" description="Turn lead and property follow-ups into assigned work with due dates, priorities, and clear ownership." actions={
      <button type="button" onClick={() => { setShowForm(!showForm); setError(""); }} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"><Plus className="size-4" /> New task</button>
    }>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="surface-panel p-4"><p className="text-sm text-muted-foreground">Open work</p><p className="mt-2 text-2xl font-semibold">{tasks.isLoading ? "—" : openCount}</p></div>
        <div className="surface-panel p-4"><p className="text-sm text-muted-foreground">Overdue</p><p className="mt-2 text-2xl font-semibold">{tasks.isLoading ? "—" : overdueCount}</p></div>
        <div className="surface-panel p-4"><p className="text-sm text-muted-foreground">All tasks</p><p className="mt-2 text-2xl font-semibold">{tasks.isLoading ? "—" : tasks.data?.length ?? 0}</p></div>
      </div>

      {showForm ? (
        <form onSubmit={addTask} className="surface-panel mb-6 space-y-4 p-5">
          <div className="flex items-center gap-2"><ClipboardList className="size-5 text-primary" /><h2 className="font-semibold">Create a follow-up</h2></div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block space-y-1.5 text-sm font-medium">Task title
              <input required minLength={2} maxLength={180} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Call buyer about the DHA plot" className="h-11 w-full rounded-lg border border-input bg-background px-3 font-normal" />
            </label>
            <label className="block space-y-1.5 text-sm font-medium">Due date and time
              <input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} className="h-11 w-full rounded-lg border border-input bg-background px-3 font-normal" />
            </label>
            <label className="block space-y-1.5 text-sm font-medium">Priority
              <select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)} className="h-11 w-full rounded-lg border border-input bg-background px-3 font-normal">{priorities.map((item) => <option key={item} value={item}>{item.replace("_", " ")}</option>)}</select>
            </label>
            <label className="block space-y-1.5 text-sm font-medium">Assign to
              <select value={assignedTo} onChange={(event) => setAssignedTo(event.target.value)} className="h-11 w-full rounded-lg border border-input bg-background px-3 font-normal"><option value="">Unassigned</option>{(references.data?.profiles ?? []).map((item) => <option key={item.id} value={item.id}>{item.full_name || item.phone || "Team member"}</option>)}</select>
            </label>
            <label className="block space-y-1.5 text-sm font-medium">Related lead
              <select value={leadId} onChange={(event) => setLeadId(event.target.value)} className="h-11 w-full rounded-lg border border-input bg-background px-3 font-normal"><option value="">No linked lead</option>{(references.data?.leads ?? []).map((item) => <option key={item.id} value={item.id}>{item.name || "Lead"}{item.preferred_city ? ` · ${item.preferred_city}` : ""}</option>)}</select>
            </label>
            <label className="block space-y-1.5 text-sm font-medium">Related property
              <select value={propertyId} onChange={(event) => setPropertyId(event.target.value)} className="h-11 w-full rounded-lg border border-input bg-background px-3 font-normal"><option value="">No linked property</option>{(references.data?.properties ?? []).map((item) => <option key={item.id} value={item.id}>{item.title}{item.city ? ` · ${item.city}` : ""}</option>)}</select>
            </label>
          </div>
          <label className="block space-y-1.5 text-sm font-medium">Notes
            <textarea maxLength={3000} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What needs to happen next?" className="w-full rounded-lg border border-input bg-background px-3 py-2 font-normal" />
          </label>
          <div className="flex flex-wrap gap-2"><button type="submit" disabled={busy || title.trim().length < 2} className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">{busy ? "Creating…" : "Create task"}</button><button type="button" onClick={() => setShowForm(false)} className="h-10 rounded-lg border border-border px-4 text-sm font-medium">Cancel</button></div>
        </form>
      ) : null}

      {error ? <p role="alert" className="mb-4 rounded-lg bg-destructive/10 p-4 text-sm text-destructive">{error}</p> : null}
      <div className="mb-4 flex flex-wrap gap-3">
        <label className="relative min-w-52 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input aria-label="Search tasks" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tasks, leads or properties" className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm" /></label>
        <select aria-label="Filter tasks by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as TaskStatus | "all")} className="h-10 rounded-lg border border-input bg-background px-3 text-sm"><option value="all">All statuses</option>{statuses.map((status) => <option key={status} value={status}>{status.replace("_", " ")}</option>)}</select>
      </div>

      <section className="surface-panel overflow-hidden">
        {tasks.isLoading ? <p className="p-6 text-sm text-muted-foreground">Loading tasks…</p> : tasks.isError ? <p role="alert" className="p-6 text-sm text-destructive">Tasks could not be loaded. Confirm the agency-task migration has been applied to your staging database.</p> : filtered.length === 0 ? (
          <div className="p-10 text-center"><ClipboardList className="mx-auto size-8 text-muted-foreground" /><h2 className="mt-3 font-semibold">No tasks found</h2><p className="mt-1 text-sm text-muted-foreground">{search || statusFilter !== "all" ? "Try a different search or status filter." : "Create a follow-up so the next action doesn't get lost."}</p></div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((task) => {
              const overdue = task.due_at && new Date(task.due_at).getTime() < Date.now() && task.status !== "completed" && task.status !== "cancelled";
              return <li key={task.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><h3 className={task.status === "completed" ? "font-medium text-muted-foreground line-through" : "font-semibold"}>{task.title}</h3><span className={task.priority === "urgent" ? "rounded-full bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive" : "rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground"}>{task.priority}</span>{overdue ? <span className="rounded-full bg-destructive/10 px-2 py-1 text-xs text-destructive">Overdue</span> : null}</div>
                  {task.description ? <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{task.description}</p> : null}
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1"><CalendarClock className="size-3.5" />{localDateTime(task.due_at)}</span>{task.assigned_to ? <span>Assigned: {teammates.get(task.assigned_to) ?? "Team member"}</span> : <span>Unassigned</span>}{task.lead_id ? <span>Lead: {leadLabels.get(task.lead_id) ?? "Linked lead"}</span> : null}{task.property_id ? <span>Property: {propertyLabels.get(task.property_id) ?? "Linked property"}</span> : null}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2"><select aria-label={`Status for ${task.title}`} value={task.status} onChange={(event) => void changeStatus(task, event.target.value as TaskStatus)} className="h-9 rounded-lg border border-input bg-background px-2 text-xs">{statuses.map((status) => <option key={status} value={status}>{status.replace("_", " ")}</option>)}</select>{task.status !== "completed" ? <button type="button" onClick={() => void changeStatus(task, "completed")} title="Mark complete" className="inline-flex size-9 items-center justify-center rounded-lg border border-border hover:bg-muted"><CheckCircle2 className="size-4" /></button> : null}</div>
              </li>;
            })}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
