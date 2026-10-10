import { createFileRoute, Outlet, Link, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getMyAccess } from "@/lib/access.functions";
import { roleHome } from "@/lib/role-home";

export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      const access = await getMyAccess();
      throw redirect({ to: roleHome(access.role) });
    }
  },
  component: AuthLayout,
});

function AuthLayout() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <Link to="/" className="mb-8 font-display text-xl font-semibold text-foreground">
        EstateOS
      </Link>
      <div className="w-full max-w-sm">
        <Outlet />
      </div>
    </div>
  );
}
