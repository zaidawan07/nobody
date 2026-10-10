import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getMyAccess } from "@/lib/access.functions";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });

    // Cached under the same query key useAccess() uses, so this fetch and
    // every component's useAccess() call below it share one result instead
    // of each re-fetching getMyAccess() independently.
    const access = await context.queryClient.ensureQueryData({
      queryKey: ["my-access"],
      queryFn: () => getMyAccess(),
    });

    return { user: data.user, access };
  },
  component: () => <Outlet />,
});
