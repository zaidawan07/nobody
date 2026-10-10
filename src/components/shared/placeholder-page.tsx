import type { LucideIcon } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/shared/ui";

export function PlaceholderPage({
  title,
  description,
  icon,
  note,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  note: string;
}) {
  return (
    <AppShell title={title} description={description}>
      <EmptyState icon={icon} title="Not built yet" description={note} />
    </AppShell>
  );
}
