import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Home,
  LayoutDashboard,
  LogOut,
  Users,
  UserSquare2,
  CalendarCheck,
  Settings,
  CreditCard,
  User,
  MessageCircle,
  Bot,
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
  { to: "/platform", label: "Overview", icon: <LayoutDashboard className="size-4" /> },
  { to: "/platform/agencies", label: "Agencies", icon: <Building2 className="size-4" /> },
  { to: "/platform/subscriptions", label: "Subscriptions", icon: <CreditCard className="size-4" /> },
  { to: "/platform/settings", label: "Settings", icon: <Settings className="size-4" /> },
];

const agencyNav: NavItem[] = [
  { to: "/agency", label: "Overview", icon: <LayoutDashboard className="size-4" /> },
  { to: "/agency/properties", label: "Properties", icon: <Home className="size-4" /> },
  { to: "/agency/leads", label: "Leads", icon: <UserSquare2 className="size-4" /> },
  { to: "/agency/visits", label: "Site visits", icon: <CalendarCheck className="size-4" /> },
  { to: "/agency/team", label: "Team", icon: <Users className="size-4" /> },
  { to: "/agency/whatsapp", label: "WhatsApp", icon: <MessageCircle className="size-4" /> },
  { to: "/agency/ai", label: "AI assistant", icon: <Bot className="size-4" /> },
  { to: "/agency/settings", label: "Agency settings", icon: <Settings className="size-4" /> },
];

const employeeNav: NavItem[] = [
  { to: "/employee", label: "Overview", icon: <LayoutDashboard className="size-4" /> },
  { to: "/employee/properties", label: "My properties", icon: <Home className="size-4" /> },
  { to: "/employee/leads", label: "My leads", icon: <UserSquare2 className="size-4" /> },
  { to: "/employee/visits", label: "My visits", icon: <CalendarCheck className="size-4" /> },
  { to: "/employee/profile", label: "Profile", icon: <User className="size-4" /> },
];

export function AppShell({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string | undefined;
  actions?: ReactNode | undefined;
  children: ReactNode;
}) {
  const { data: access } = useAccess();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const isSuper = access?.role === "super_admin";
  const isAgencyAdmin = access?.role === "agency_admin";

  const items: NavItem[] = isSuper ? platformNav : isAgencyAdmin ? agencyNav : employeeNav;

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-screen bg-background">
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
                activeOptions={{ exact: item.to === "/platform" || item.to === "/agency" || item.to === "/employee" }}
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

      <main className="flex-1 overflow-x-hidden pb-20 md:pb-0">
        <header className="border-b border-border bg-card/70 px-4 py-4 backdrop-blur md:px-6 md:py-5">
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
        <div className="px-4 py-4 md:px-6 md:py-6">{children}</div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-card px-1 py-1 md:hidden">
        {items.slice(0, 5).map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="flex flex-1 flex-col items-center gap-0.5 rounded-md px-1 py-1.5 text-[10px] text-muted-foreground"
            activeProps={{ className: "flex flex-1 flex-col items-center gap-0.5 rounded-md px-1 py-1.5 text-[10px] font-medium text-foreground bg-accent" }}
            activeOptions={{ exact: item.to === "/platform" || item.to === "/agency" || item.to === "/employee" }}
          >
            {item.icon}
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
