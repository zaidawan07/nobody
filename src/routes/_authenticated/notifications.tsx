import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell, Check, CheckCheck, Loader2 } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  listNotifications,
  unreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/lib/notifications.functions";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({ meta: [{ title: "Notifications — EstateOS" }] }),
  component: NotificationsPage,
});

function relativeTime(iso: string) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function NotificationsPage() {
  const queryClient = useQueryClient();
  const [cursor, setCursor] = useState<null | string>(null);
  const [error, setError] = useState<null | string>(null);
  const [busyId, setBusyId] = useState<null | string>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const fetchList = useServerFn(listNotifications);
  const fetchUnread = useServerFn(unreadNotificationCount);
  const markOne = useServerFn(markNotificationRead);
  const markAll = useServerFn(markAllNotificationsRead);

  const { data, isLoading } = useQuery({
    queryKey: ["notifications", "list", cursor],
    queryFn: () => fetchList({ data: { before: cursor ?? undefined } }),
  });
  const { data: unread } = useQuery({
    queryKey: ["notifications", "unread"],
    queryFn: () => fetchUnread(),
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };

  async function onMarkOne(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await markOne({ data: { id } });
      await invalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not mark that read.");
    } finally {
      setBusyId(null);
    }
  }

  async function onMarkAll() {
    setMarkingAll(true);
    setError(null);
    try {
      await markAll();
      await invalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not mark everything read.");
    } finally {
      setMarkingAll(false);
    }
  }

  const items = data?.items ?? [];
  const nextCursor = data?.nextCursor ?? null;
  const unreadCount = unread?.count ?? 0;

  return (
    <AppShell
      title="Notifications"
      description={
        unreadCount > 0
          ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`
          : "You're all caught up."
      }
      actions={
        items.length > 0 && unreadCount > 0 ? (
          <Button size="sm" variant="secondary" onClick={onMarkAll} disabled={markingAll}>
            {markingAll ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CheckCheck className="size-4" />
            )}
            Mark all read
          </Button>
        ) : null
      }
    >
      {error ? (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="No notifications yet"
          description="Lead assignments and site-visit requests will show up here."
          icon={Bell}
        />
      ) : (
        <div className="space-y-2">
          {items.map((n) => {
            const unread = !n.read_at;
            return (
              <Card
                key={n.id}
                className={unread ? "border-primary/40 bg-primary/[0.03]" : undefined}
                data-testid="notification-row"
                data-read={unread ? "false" : "true"}
              >
                <CardContent className="flex items-start gap-3 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className={`text-sm ${unread ? "font-semibold" : "font-medium"}`}>
                        {n.title}
                      </p>
                      <span className="text-xs text-muted-foreground">
                        {relativeTime(n.created_at)}
                      </span>
                    </div>
                    {n.body ? (
                      <p className="mt-1 text-sm text-muted-foreground">{n.body}</p>
                    ) : null}
                  </div>
                  {unread ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onMarkOne(n.id)}
                      disabled={busyId === n.id}
                      aria-label={`Mark "${n.title}" read`}
                    >
                      {busyId === n.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Check className="size-4" />
                      )}
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}

          {nextCursor ? (
            <div className="pt-2">
              <Button variant="outline" onClick={() => setCursor(nextCursor)}>
                Load older
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </AppShell>
  );
}
