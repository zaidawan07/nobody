import { describe, expect, it } from "bun:test";
import { constantTimeSecretMatch, resolvePrimaryRole } from "../src/lib/security";

describe("resolvePrimaryRole", () => {
  it("returns null when the user has no assigned role", () => {
    expect(resolvePrimaryRole([])).toBeNull();
  });

  it("prefers platform ownership over agency roles regardless of row order", () => {
    expect(resolvePrimaryRole([{ role: "employee" }, { role: "super_admin" }, { role: "agency_admin" }])).toBe("super_admin");
  });

  it("prefers agency admin over employee", () => {
    expect(resolvePrimaryRole([{ role: "employee" }, { role: "agency_admin" }])).toBe("agency_admin");
  });

  it("ignores unrecognized role strings", () => {
    expect(resolvePrimaryRole([{ role: "unknown" }])).toBeNull();
  });
});

describe("constantTimeSecretMatch", () => {
  it("matches the same secret", async () => {
    expect(await constantTimeSecretMatch("safe secret", "safe secret")).toBe(true);
  });

  it("rejects a different secret", async () => {
    expect(await constantTimeSecretMatch("wrong secret", "right secret")).toBe(false);
  });

  it("supports Unicode secrets", async () => {
    expect(await constantTimeSecretMatch("پاس ورڈ 🔐", "پاس ورڈ 🔐")).toBe(true);
  });
});
