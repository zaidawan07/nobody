import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// Open follow-ups for the caller. Reads go through the caller's own connection,
// so can_access_assigned_lead (0015) limits the rows to the assignee and the
// agency's admins -- an employee does not see a colleague's follow-ups.

type FollowupRow = {
  id: string;
  due_at: string;
  note: string | null;
  status: "open" | "done" | "cancelled";
  lead_id: string;
  assigned_to: string | null;
  leads: { name: string | null; phone: string | null } | null;
};

function fmtDue(iso: string) {
  const due = new Date(iso);
  const now = new Date();
  const days = Math.round((due.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  const when = due.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  if (days < 0) return `overdue since ${when}`;
  if (days === 0) return `due today`;
  if (days === 1) return `due tomorrow`;
  return `due ${when}`;
}

export function FollowUpsDue() {
  const { data, isLoading } = useQuery({
    queryKey: ["followups-due"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_followups")
        .select("id, due_at, note, status, lead_id, assigned_to, leads(name, phone)")
        .eq("status", "open")
        .order("due_at", { ascending: true })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as FollowupRow[];
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading follow-ups
      </div>
    );
  }

  const rows = data ?? [];

  return (
    <div className="surface-panel space-y-3 p-5">
      <h2 className="text-sm font-semibold text-foreground">Follow-ups due</h2>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing is due. Follow-ups you or your teammates set will appear here.
        </p>
      ) : (
        <ul className="divide-y">
          {rows.map((f) => (
            <li key={f.id} className="flex items-start justify-between gap-3 py-2 first:pt-0">
              <div className="min-w-0">
                <p className="truncate text-sm text-foreground">
                  {f.leads?.name ?? f.leads?.phone ?? "A lead"}
                </p>
                {f.note ? <p className="truncate text-xs text-muted-foreground">{f.note}</p> : null}
              </div>
              <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                <CalendarClock className="size-3" />
                {fmtDue(f.due_at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
