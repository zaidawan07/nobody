import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { roleHome } from "@/lib/role-home";

export const Route = createFileRoute("/_authenticated/platform")({
  beforeLoad: ({ context }) => {
    if (context.access.role !== "super_admin") {
      throw redirect({ to: roleHome(context.access.role) });
    }
  },
  component: () => <Outlet />,
});
