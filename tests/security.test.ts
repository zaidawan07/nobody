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
    "../supabase/migrations/20261014200000_agency_tasks.sql",
    "../supabase/migrations/20261014210000_ai_reply_safeguards.sql",
    "../supabase/migrations/20261014220000_subscriptions_and_limits.sql",
  ];

  it("uses balanced dollar-quoted SQL blocks in every migration", () => {
    for (const path of migrationFiles) {
      const sql = readFileSync(new URL(path, import.meta.url), "utf8");
      const delimiters = sql.match(/\$\$/g) ?? [];
      expect(delimiters.length % 2).toBe(0);
      expect(sql).not.toMatch(/AS \$(?:\r?\n)/);
      expect(sql).not.toMatch(/^\$;$/m);
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


import { toCsv } from "../src/lib/csv";

describe("spreadsheet CSV exports", () => {
  it("quotes fields and escapes embedded quotes and line breaks", () => {
    const csv = toCsv([{ name: 'A "quoted" name', notes: "line one\nline two" }], [
      { key: "name", label: "Name" },
      { key: "notes", label: "Notes" },
    ]);
    expect(csv).toContain('"A ""quoted"" name"');
    expect(csv).toContain('"line one\nline two"');
    expect(csv.startsWith("\uFEFF")).toBe(true);
  });

  it("neutralizes spreadsheet formula prefixes in user-controlled fields", () => {
    const csv = toCsv([{ name: "=IMPORTXML(\"https://example.com\",\"//x\")", phone: "+12345", notes: "@SUM(A1:A2)" }], [
      { key: "name", label: "Name" },
      { key: "phone", label: "Phone" },
      { key: "notes", label: "Notes" },
    ]);
    expect(csv).toContain("'=IMPORTXML");
    expect(csv).toContain("'+12345");
    expect(csv).toContain("'@SUM");
  });

  it("exports empty data as a header-only document", () => {
    const csv = toCsv([] as Array<{ name: string }>, [{ key: "name", label: "Name" }]);
    expect(csv).toBe("\uFEFF\"Name\"\r\n");
  });
});


describe("agency follow-up task isolation", () => {
  it("binds task assignees, leads, and properties to the same agency", () => {
    const sql = readFileSync(
      new URL("../supabase/migrations/20261014200000_agency_tasks.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("agency_tasks_assignee_same_agency_fk");
    expect(sql).toContain("agency_tasks_lead_same_agency_fk");
    expect(sql).toContain("agency_tasks_property_same_agency_fk");
    expect(sql).toContain("agency_tasks_creator_same_agency_fk");
    expect(sql).toContain('USING (agency_id = public.current_agency_id())');
    expect(sql).toContain('USING (public.is_agency_admin(agency_id))');
  });
});


describe("WhatsApp AI reply safety", () => {
  it("bounds AI configuration in the database", () => {
    const sql = readFileSync(
      new URL("../supabase/migrations/20261014210000_ai_reply_safeguards.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("whatsapp_configs_ai_greeting_length_check");
    expect(sql).toContain("whatsapp_configs_ai_instructions_length_check");
    expect(sql).toContain("whatsapp_configs_ai_language_check");
    expect(sql).toContain("conversation_messages_ai_usage_idx");
  });

  it("keeps opt-out, human handoff, session-window and quota guards in the worker", () => {
    const worker = readFileSync(
      new URL("../supabase/functions/whatsapp-webhook-worker/index.ts", import.meta.url),
      "utf8",
    );
    expect(worker).toContain("OPENAI_API_KEY");
    expect(worker).toContain("store: false");
    expect(worker).toContain("AI_MAX_REPLIES_PER_AGENCY_PER_DAY");
    expect(worker).toContain("AI_MAX_REPLIES_PER_CONVERSATION_PER_HOUR");
    expect(worker).toContain("isOptOutRequest(body)");
    expect(worker).toContain("conversation.opted_out_at");
    expect(worker).toContain("24 * 60 * 60 * 1000");
    expect(worker).toContain("biz_opaque_callback_data");
    expect(worker).toContain("deterministicRequestId");
  });
});


describe("subscription and quota enforcement", () => {
  it("creates default subscriptions and enforces database-side limits", () => {
    const sql = readFileSync(
      new URL("../supabase/migrations/20261014220000_subscriptions_and_limits.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("set_default_agency_subscription");
    expect(sql).toContain("enforce_agency_plan_limit");
    expect(sql).toContain("PLAN_LIMIT_EXCEEDED");
    expect(sql).toContain("subscription_change_requests_one_open_per_agency_idx");
    expect(sql).toContain("resolve_subscription_change_request");
    expect(sql).toContain("agency_subscriptions_plan_status_idx");
  });
});
