export type AppRole = "super_admin" | "agency_admin" | "employee";

export function resolvePrimaryRole(roles: readonly { role: string }[]): AppRole | null {
  if (roles.some((item) => item.role === "super_admin")) return "super_admin";
  if (roles.some((item) => item.role === "agency_admin")) return "agency_admin";
  if (roles.some((item) => item.role === "employee")) return "employee";
  return null;
}

export async function constantTimeSecretMatch(candidate: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [candidateHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(candidate)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const left = new Uint8Array(candidateHash);
  const right = new Uint8Array(expectedHash);
  let difference = 0;
  for (let i = 0; i < left.length; i += 1) difference |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return difference === 0;
}
