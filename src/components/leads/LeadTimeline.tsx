import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// Lead timeline. The rows come back through the caller's own RLS-bound
// connection, so can_access_assigned_lead (migration 0015) is what limits
// them: the assignee and the agency's admins, nobody else.

type ActivityRow = {
  id: string;
  type: "note" | "call" | "status_change" | "visit" | "assignment" | "system";
  body: string | null;
  author_id: string | null;
  metadata: Record<string, unknown> | null;
  is_system: boolean;
  created_at: string;
};

const typeLabels: Record<string, string> = {
  note: "Note",
  call: "Call",
  status_change: "Status change",
  visit: "Visit",
  assignment: "Assignment",
  system: "System",
};

function fmtWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/** Renders the structured part of a status_change or assignment entry. */
function describeChange(row: ActivityRow): string | null {
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  // Bracket notation: noPropertyAccessFromIndexSignature forbids meta.from.
  const from = typeof meta["from"] === "string" ? meta["from"] : null;
  const to = typeof meta["to"] === "string" ? meta["to"] : null;
  if (row.type === "status_change" && (from || to)) {
    return `${from ?? "unset"} → ${to ?? "unset"}`;
  }
  if (row.type === "assignment" && to) return `assigned to ${to}`;
  return null;
}

export function LeadTimeline({ leadId }: { leadId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["lead-activities", leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_activities")
        .select("id, type, body, author_id, metadata, is_system, created_at")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ActivityRow[];
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading activity…
      </div>
    );
  }

  const rows = data ?? [];

  if (rows.length === 0) {
    // An empty state, not a placeholder number. This is the true state for most
    // leads, and saying so is correct.
    return (
      <p className="text-sm text-muted-foreground">
        No activity recorded yet. Notes you add, and status or assignment changes, will appear here.
      </p>
    );
  }

  return (
    <ol className="space-y-3">
      {rows.map((row) => (
        <li key={row.id} className="flex gap-3">
          <span className="mt-1 size-2 shrink-0 rounded-full bg-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-sm">
              <span className="font-medium text-foreground">
                {typeLabels[row.type] ?? row.type}
              </span>
              <span className="text-muted-foreground"> · {fmtWhen(row.created_at)}</span>
            </p>
            {describeChange(row) ? (
              <p className="text-xs text-muted-foreground">{describeChange(row)}</p>
            ) : null}
            {row.body ? <p className="mt-0.5 text-sm text-foreground">{row.body}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
