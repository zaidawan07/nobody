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


import { readFileSync } from "node:fs";

describe("database security migrations", () => {
  const migrationFiles = [
    "../supabase/migrations/20260924173628_multi_tenant_realestate_foundation.sql",
    "../supabase/migrations/20261014163000_profile_security_hardening.sql",
    "../supabase/migrations/20261014170000_whatsapp_cloud_api.sql",
    "../supabase/migrations/20261014183000_tenant_relationships_and_rls.sql",
    "../supabase/migrations/20261014190000_webhook_worker_recovery.sql",
  ];

  it("uses balanced dollar-quoted SQL blocks in every migration", () => {
    for (const path of migrationFiles) {
      const sql = readFileSync(new URL(path, import.meta.url), "utf8");
      const delimiters = sql.match(/\$\$/g) ?? [];
      expect(delimiters.length % 2, path).toBe(0);
      expect(sql, path).not.toMatch(/AS \$(?:\r?\n)/);
      expect(sql, path).not.toMatch(/^\$;$/m);
    }
  });

  it("enforces tenant-matched foreign keys for CRM and conversation references", () => {
    const sql = readFileSync(
      new URL("../supabase/migrations/20261014183000_tenant_relationships_and_rls.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("property_media_same_agency_property_fk");
    expect(sql).toContain("site_visits_same_agency_lead_fk");
    expect(sql).toContain("site_visits_same_agency_property_fk");
    expect(sql).toContain("conversation_messages_same_agency_conversation_fk");
    expect(sql).toContain("agency admins delete leads");
    expect(sql).not.toContain('CREATE POLICY "tenant members access properties"');
  });

  it("keeps webhook retry scheduling and stale-claim recovery in the schema", () => {
    const sql = readFileSync(
      new URL("../supabase/migrations/20261014190000_webhook_worker_recovery.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("locked_at");
    expect(sql).toContain("next_attempt_at");
    expect(sql).toContain("dead_lettered_at");
  });
});
