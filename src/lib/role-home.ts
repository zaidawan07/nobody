import type { AppRole } from "@/lib/access.functions";

/**
 * Where a signed-in user belongs. `null` covers a brand-new account with no
 * role yet (self-signup before any admin has linked it to an agency) -- see
 * routes/_authenticated/pending.tsx.
 */
export function roleHome(role: AppRole | null): string {
  switch (role) {
    case "super_admin":
      return "/platform";
    case "agency_admin":
      return "/agency";
    case "employee":
      return "/employee";
    default:
      return "/pending";
  }
}
