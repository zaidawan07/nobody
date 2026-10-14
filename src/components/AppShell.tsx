import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Home,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Users,
  UserSquare2,
  CalendarCheck,
  Bot,
  BarChart3,
  Settings,
} from "lucide-react";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAccess } from "@/hooks/useAccess";
import { titleCase } from "@/lib/format";

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
}

const platformNav: NavItem[] = [
  { to: "/platform", label: "Agencies", icon: <Building2 className="size-4" /> },
  { to: "/settings", label: "My profile", icon: <Settings className="size-4" /> },
];

const agencyNav: NavItem[] = [
  { to: "/agency", label: "Overview", icon: <LayoutDashboard className="size-4" /> },
  { to: "/properties", label: "Properties", icon: <Home className="size-4" /> },
  { to: "/leads", label: "Leads", icon: <UserSquare2 className="size-4" /> },
  { to: "/visits", label: "Site visits", icon: <CalendarCheck className="size-4" /> },
  { to: "/conversations", label: "WhatsApp inbox", icon: <MessageSquare className="size-4" /> },
  { to: "/reports", label: "Reports & exports", icon: <BarChart3 className="size-4" /> },
  { to: "/settings", label: "My profile", icon: <Settings className="size-4" /> },
];

export function AppShell({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { data: access } = useAccess();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const isSuper = access?.role === "super_admin";
  const isAgencyAdmin = access?.role === "agency_admin";

  const items: NavItem[] = isSuper
    ? platformNav
    : [
        ...agencyNav,
        ...(isAgencyAdmin
          ? [
              { to: "/team", label: "Team", icon: <Users className="size-4" /> },
              { to: "/whatsapp", label: "AI assistant", icon: <Bot className="size-4" /> },
            ]
          : []),
      ];

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col bg-background md:flex-row">
      <aside className="hidden w-64 shrink-0 flex-col justify-between bg-sidebar px-4 py-6 text-sidebar-foreground md:flex">
        <div>
          <div className="px-2">
            <p className="font-display text-lg font-semibold">EstateOS</p>
            <p className="mt-1 text-xs text-sidebar-foreground/70">
              {isSuper ? "Platform control" : (access?.agencyName ?? "Agency workspace")}
            </p>
          </div>

          <nav className="mt-8 space-y-1">
            {items.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                activeProps={{
                  className:
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm bg-sidebar-accent text-sidebar-accent-foreground font-medium",
                }}
              >
                {item.icon}
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="space-y-3 px-2">
          <div className="text-xs text-sidebar-foreground/70">
            <p className="font-medium text-sidebar-foreground">{access?.fullName ?? "Signed in"}</p>
            <p className="truncate">{access?.email}</p>
            {access?.role ? (
              <Badge className="mt-2 bg-sidebar-primary text-sidebar-primary-foreground">
                {titleCase(access.role)}
              </Badge>
            ) : null}
          </div>
          <Button variant="secondary" size="sm" className="w-full" onClick={signOut}>
            <LogOut className="size-4" /> Sign out
          </Button>
        </div>
      </aside>

      <div className="border-b border-sidebar-border bg-sidebar px-3 py-3 text-sidebar-foreground md:hidden">
        <nav aria-label="Workspace navigation" className="flex gap-1 overflow-x-auto pb-2">
          {items.map((item) => (
            <Link key={item.to} to={item.to} className="inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
              {item.icon}<span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="flex items-center justify-between gap-3 border-t border-sidebar-border pt-2">
          <div className="min-w-0 text-xs"><p className="truncate font-medium">{access?.fullName ?? "Signed in"}</p><p className="truncate text-sidebar-foreground/70">{access?.agencyName ?? access?.email}</p></div>
          <Button variant="secondary" size="sm" onClick={signOut}><LogOut className="size-4" /> Sign out</Button>
        </div>
      </div>

      <main className="min-w-0 flex-1 overflow-x-hidden">
        <header className="border-b border-border bg-card/70 px-6 py-5 backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold">{title}</h1>
              {description ? (
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">{actions}</div>
          </div>
        </header>
        <div className="px-6 py-6">{children}</div>
      </main>
    </div>
  );
}
