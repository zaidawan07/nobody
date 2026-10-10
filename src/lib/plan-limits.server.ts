// Server-only plan-limit helpers.
//
// Migration 0008 installs a BEFORE INSERT trigger that enforces
// plan_features.limit_value for client writes. The trigger deliberately steps
// aside for service_role and for owner-context work, so writes that go through
// the service-role client (employee provisioning is the only one today) are
// checked here instead. Both paths have to pass for a write to land.
//
// Limit conventions match 0008 / the seeded plan_features:
//   null    -> no subscription row or no feature row (unconstrained)
//   -1      -> unlimited
//   0       -> blocked outright
//   > 0     -> the plan already holds this many, refuse another

type RpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

/** null = no limit; -1 = unlimited; 0 = blocked; > 0 = the cap. */
export async function fetchPlanLimit(
  supabase: RpcClient,
  agencyId: string,
  metricKey: string,
): Promise<number | null> {
  const { data, error } = await supabase.rpc("plan_limit_for_agency", {
    _agency_id: agencyId,
    _metric_key: metricKey,
  });
  if (error) throw new Error(error.message);
  if (data === null || data === undefined) return null;
  const n = Number(data);
  return Number.isFinite(n) ? n : null;
}

/** Reads the limit and, when one applies, the live count for that metric. */
export async function fetchPlanUsage(
  supabase: RpcClient,
  agencyId: string,
  metricKey: string,
): Promise<{ limit: number | null; count: number | null; unlimited: boolean }> {
  const limit = await fetchPlanLimit(supabase, agencyId, metricKey);
  const unlimited = limit === null || limit < 0;
  const { data, error } = await supabase.rpc("count_agency_metric", {
    _agency_id: agencyId,
    _metric_key: metricKey,
  });
  if (error) throw new Error(error.message);
  const count = typeof data === "number" ? data : null;
  return { limit, count, unlimited };
}

/** Throws a user-facing error when adding one more `metricKey` would break the plan. */
export async function assertPlanLimit(
  supabase: RpcClient,
  agencyId: string,
  metricKey: string,
): Promise<void> {
  const limit = await fetchPlanLimit(supabase, agencyId, metricKey);
  if (limit === null || limit < 0) return; // unconstrained or unlimited

  const { data, error } = await supabase.rpc("count_agency_metric", {
    _agency_id: agencyId,
    _metric_key: metricKey,
  });
  if (error) throw new Error(error.message);
  const count = typeof data === "number" ? data : 0;

  if (count >= limit) {
    throw new Error(
      `Plan limit reached: this plan allows ${limit} ${metricKey} and the agency already has ${count}. ` +
        `Ask the platform owner to upgrade the plan.`,
    );
  }
}
