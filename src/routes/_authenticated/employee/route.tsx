import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { roleHome } from "@/lib/role-home";

export const Route = createFileRoute("/_authenticated/employee")({
  beforeLoad: ({ context }) => {
    if (context.access.role !== "employee") {
      throw redirect({ to: roleHome(context.access.role) });
    }
  },
  component: () => <Outlet />,
});
