#!/usr/bin/env node
// clear-test-data.mjs -- delete the seeded test data and nothing else.
//
// Run with:
//   node scripts/clear-test-data.mjs --yes
//
// Same safety gate as the seed (scripts/lib/test-data-env.mjs): it refuses to
// run unless SEED_ALLOWED_PROJECT_REF in .env equals the project ref parsed
// out of SUPABASE_URL, and it prints the ref and asks for confirmation unless
// --yes is passed.
//
// What it deletes, and only this:
//   * auth users whose email ends in @test.estateos.local,
//   * agencies whose slug starts with "test-" AND whose profiles all belong to
//     those test users (an agency with even one non-test profile is skipped),
//   * every row in those agencies, children first, in FK-safe order,
//   * the storage objects under those agencies in the property-media bucket.
//
// It never touches: platform_bootstrap, any user whose email is not on the
// test domain, any agency with a non-test profile, or any row that belongs to
// a real agency. Deletions are counted per table and reported.

import {
  redact,
  openTestDataClient,
  TEST_EMAIL_DOMAIN,
  TEST_AGENCY_SLUG_PREFIX,
} from "./lib/test-data-env.mjs";

/** Children first: every table that has an agency_id FK. */
const DELETE_ORDER = [
  "property_checkins",
  "property_media",
  "site_visits",
  "conversation_messages",
  "conversations",
  "leads",
  "properties",
  "whatsapp_configs",
  "usage_counters",
  "subscriptions",
  "audit_logs",
];

let secretValues = [];

function parseArgs(argv) {
  const args = { yes: false, envFile: undefined, overlayFile: undefined };
  let wantHelp = false;
  let badOption = null;
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--yes" || arg === "-y") args.yes = true;
    else if (arg === "--help" || arg === "-h") wantHelp = true;
    else if (arg.startsWith("--env=")) args.envFile = arg.slice("--env=".length);
    else if (arg === "--env") args.envFile = argv[++i];
    else if (arg.startsWith("--overlay-file="))
      args.overlayFile = arg.slice("--overlay-file=".length);
    else if (arg === "--overlay-file") args.overlayFile = argv[++i];
    else badOption = arg;
  }
  if (wantHelp) {
    console.log(`Usage: node scripts/clear-test-data.mjs [--yes] [--env <path>] [--overlay-file <path>]

Deletes ONLY:
  * @${TEST_EMAIL_DOMAIN} auth users,
  * ${TEST_AGENCY_SLUG_PREFIX}* agencies whose profiles are all test users,
  * every row in those agencies (children first, FK-safe order).

Options:
  --yes, -y           Skip the interactive project-ref confirmation.
  --env <path>         Read the .env values from another file (default .env).
  --overlay-file <p>  Extra file that may only add SEED_ALLOWED_PROJECT_REF
                      and SEED_TEST_PASSWORD.
  --help, -h          Show this help.`);
    process.exit(0);
  }
  if (badOption) {
    console.error(`Unknown option: ${badOption}`);
    process.exit(2);
  }
  return args;
}

const isTestEmail = (email) =>
  typeof email === "string" && email.toLowerCase().endsWith(`@${TEST_EMAIL_DOMAIN}`);

async function main() {
  const args = parseArgs(process.argv);
  const { supabase, secrets, target } = await openTestDataClient({
    scriptName: "clear-test-data",
    purpose: [
      `deletes ONLY @${TEST_EMAIL_DOMAIN} users and ${TEST_AGENCY_SLUG_PREFIX}* agencies`,
      "any agency with a non-test profile is skipped",
    ],
    yes: args.yes,
    envFile: args.envFile,
    overlayFile: args.overlayFile,
  });
  secretValues = secrets;

  // ---- 1. the test users -------------------------------------------------
  const testUsers = [];
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const users = data?.users ?? [];
    for (const user of users) if (isTestEmail(user.email)) testUsers.push(user);
    if (users.length < 200) break;
  }
  console.log(`\n  found ${testUsers.length} test account(s) (@${TEST_EMAIL_DOMAIN})`);

  const testUserIds = testUsers.map((u) => u.id);

  // ---- 2. the agencies that belong to them -------------------------------
  // Two routes to an agency: a test user's profile points at it, or its slug
  // carries the test prefix. Either way it is only deleted when EVERY profile
  // in it belongs to a test user.
  const candidateIds = new Set();
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, agency_id, email");
  if (profilesError) throw new Error(`profiles lookup failed: ${profilesError.message}`);

  for (const profile of profiles ?? []) {
    if (testUserIds.includes(profile.id) && profile.agency_id) candidateIds.add(profile.agency_id);
  }
  const { data: slugAgencies, error: slugError } = await supabase
    .from("agencies")
    .select("id, slug")
    .ilike("slug", `${TEST_AGENCY_SLUG_PREFIX}%`);
  if (slugError) throw new Error(`agencies lookup failed: ${slugError.message}`);
  for (const agency of slugAgencies ?? []) candidateIds.add(agency.id);

  const agencyIds = [];
  const skipped = [];
  for (const agencyId of candidateIds) {
    const members = (profiles ?? []).filter((p) => p.agency_id === agencyId);
    const foreignMembers = members.filter((p) => !testUserIds.includes(p.id));
    if (foreignMembers.length > 0) {
      skipped.push({ agencyId, count: foreignMembers.length });
      continue;
    }
    agencyIds.push(agencyId);
  }

  if (skipped.length > 0) {
    console.log(`  skipped ${skipped.length} agency(ies) that hold non-test profiles:`);
    for (const s of skipped) console.log(`    ${s.agencyId}  (${s.count} non-test profile(s))`);
  }
  console.log(`  deleting ${agencyIds.length} seeded agency(ies)`);

  // ---- 3. agency rows, children first ------------------------------------
  const report = [];
  for (const table of DELETE_ORDER) {
    if (agencyIds.length === 0) break;
    const { error, count } = await supabase
      .from(table)
      .delete({ count: "exact" })
      .in("agency_id", agencyIds);
    if (error) throw new Error(`${table} delete failed: ${error.message}`);
    report.push({ table, deleted: count ?? 0 });
  }

  // ---- 4. storage objects under those agencies ---------------------------
  let objectsRemoved = 0;
  if (agencyIds.length > 0) {
    const { data: files, error: listError } = await supabase.storage
      .from("property-media")
      .list("", { limit: 100, sortBy: { column: "name", order: "asc" } });
    if (listError) {
      console.log(
        `  storage: could not list the bucket (${listError.message}) -- skipping object removal`,
      );
    } else {
      const paths = [];
      const walk = async (prefix) => {
        const { data: entries } = await supabase.storage.from("property-media").list(prefix, {
          limit: 100,
          sortBy: { column: "name", order: "asc" },
        });
        for (const entry of entries ?? []) {
          const full = prefix ? `${prefix}/${entry.name}` : entry.name;
          if (entry.id) paths.push(full);
          else await walk(full);
        }
      };
      for (const entry of files ?? []) {
        const full = entry.name;
        if (entry.id) paths.push(full);
        else if (agencyIds.some((id) => full.startsWith(`${id}/`))) await walk(full);
      }
      const scoped = paths.filter((p) => agencyIds.some((id) => p.startsWith(`${id}/`)));
      if (scoped.length > 0) {
        const { error: removeError } = await supabase.storage.from("property-media").remove(scoped);
        if (removeError) {
          console.log(`  storage: could not remove objects (${removeError.message})`);
        } else {
          objectsRemoved = scoped.length;
        }
      }
    }
  }

  // ---- 5. the test users' own rows, then the auth users ------------------
  if (testUserIds.length > 0) {
    const { error: rolesError, count: rolesCount } = await supabase
      .from("user_roles")
      .delete({ count: "exact" })
      .in("user_id", testUserIds);
    if (rolesError) throw new Error(`user_roles delete failed: ${rolesError.message}`);
    report.push({ table: "user_roles", deleted: rolesCount ?? 0 });

    const { error: profileError, count: profileCount } = await supabase
      .from("profiles")
      .delete({ count: "exact" })
      .in("id", testUserIds);
    if (profileError) throw new Error(`profiles delete failed: ${profileError.message}`);
    report.push({ table: "profiles", deleted: profileCount ?? 0 });

    let deletedUsers = 0;
    for (const user of testUsers) {
      const { error } = await supabase.auth.admin.deleteUser(user.id);
      if (error) throw new Error(`deleteUser failed for ${user.email}: ${error.message}`);
      deletedUsers += 1;
    }
    report.push({ table: "auth.users", deleted: deletedUsers });
  }

  // ---- 6. the agencies themselves ----------------------------------------
  if (agencyIds.length > 0) {
    const { error, count } = await supabase
      .from("agencies")
      .delete({ count: "exact" })
      .in("id", agencyIds);
    if (error) throw new Error(`agencies delete failed: ${error.message}`);
    report.push({ table: "agencies", deleted: count ?? 0 });
  }

  // ---- report ------------------------------------------------------------
  console.log("\nDeleted:");
  for (const row of report) {
    if (row.deleted > 0) console.log(`  ${row.table.padEnd(24)} ${row.deleted}`);
  }
  console.log(`  ${"storage objects".padEnd(24)} ${objectsRemoved}`);
  console.log(`\nNothing outside @${TEST_EMAIL_DOMAIN} was touched.`);
  console.log(`Project: ${target.ref} (${target.host}).\n`);
}

try {
  await main();
} catch (e) {
  console.error(`\nFAILED: ${redact(e instanceof Error ? e.message : String(e), secretValues)}\n`);
  process.exit(1);
}
