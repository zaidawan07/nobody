import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { titleCase, getLeadStatusLabel } from "@/lib/format";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="surface-panel flex flex-col items-center gap-3 px-6 py-16 text-center">
      <div className="rounded-full bg-secondary p-3 text-secondary-foreground">
        <Icon className="size-5" />
      </div>
      <div className="space-y-1">
        <p className="font-medium text-foreground">{title}</p>
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  icon: LucideIcon;
}) {
  return (
    <div className="surface-panel flex items-center gap-4 p-5">
      <div className="rounded-lg bg-secondary p-2.5 text-secondary-foreground">
        <Icon className="size-5" />
      </div>
      <div>
        <p className="text-2xl font-semibold leading-none">{value}</p>
        <p className="mt-1 text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

// account_status / property_status / lead_status / visit_status /
// whatsapp_connection_status all collapse cleanly onto these four tones.
const POSITIVE = new Set(["active", "available", "confirmed", "connected", "completed", "won"]);
const NEGATIVE = new Set(["suspended", "cancelled", "lost", "no_show", "error"]);
const NEUTRAL = new Set(["sold", "rented", "inactive", "closed"]);
const CAUTION = new Set(["pending", "reserved", "requested", "not_connected", "contacted", "qualified", "negotiating", "visit_scheduled"]);

export function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return null;
  const tone = POSITIVE.has(status)
    ? "bg-success text-success-foreground"
    : NEGATIVE.has(status)
      ? "bg-destructive text-destructive-foreground"
      : CAUTION.has(status)
        ? "bg-warning text-warning-foreground"
        : NEUTRAL.has(status)
          ? "bg-muted text-muted-foreground"
          : "bg-secondary text-secondary-foreground";
  return <Badge className={cn("font-normal hover:bg-none", tone)}>{getLeadStatusLabel(status)}</Badge>;
}
