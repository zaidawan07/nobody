#!/usr/bin/env node
// seed-test-data.mjs -- deterministic, repeatable demo/test data for EstateOS.
//
// Run with:
//   node scripts/seed-test-data.mjs                 (interactive confirm)
//   node scripts/seed-test-data.mjs --yes           (non-interactive)
//   node scripts/seed-test-data.mjs --scenario free-plan-overflow
//
// Safety gate (scripts/lib/test-data-env.mjs, and it cannot be bypassed):
// the script refuses to run unless SEED_ALLOWED_PROJECT_REF in .env equals the
// project ref parsed out of SUPABASE_URL, prints the ref, and waits for a
// typed confirmation unless --yes. No flag, env var or default can point it at
// another project.
//
// Repeatability: faker is seeded with a FIXED constant, every timestamp comes
// from a FIXED anchor, and every natural key (reference codes, phone numbers,
// conversation phones, storage paths) is derived from a counter. Running twice
// therefore resolves the same rows and UPDATEs them instead of inserting
// duplicates -- verify with the per-table created/updated counts.
//
// It respects the live database's rules:
//   * handle_new_user               (0000) createUser auto-inserts a bare
//                                             profile row; we then update it.
//   * protect_profile_privileged_columns (0001) we write profiles through the
//                                             service-role client, the only
//                                             context allowed to set agency_id.
//   * enforce_plan_limit            (0008) skipped for service_role, so the
//                                             seed still stays inside the Free
//                                             plan by count (see the summary).
//   * validate_*_links              (0004) every lead_id / property_id /
//                                             conversation_id / assigned_to is
//                                             taken from the same agency.
//   * property_media_one_cover_idx  (0005) exactly one cover photo per property.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { faker } from "@faker-js/faker";
import { redact, openTestDataClient } from "./lib/test-data-env.mjs";
import { TEST_EMAIL_DOMAIN, TEST_AGENCY_SLUG_PREFIX } from "./lib/test-data-env.mjs";
import {
  CITIES,
  PROPERTY_TYPES,
  PROPERTY_TYPE_LABELS,
  FEATURES,
  fakePersonName,
} from "./lib/test-data-content.mjs";

// ---------------------------------------------------------------------------
// Constants -- both fixed, so two runs produce identical data.
// ---------------------------------------------------------------------------

const FIXED_SEED = 20260211;
const SEED_ANCHOR = Date.parse("2026-10-01T09:00:00.000Z");
const DAY = 86_400_000;

/** All staff/lead/contact numbers come from this reserved test-only block. */
const phoneCounter = { value: 0 };
function nextPhone() {
  phoneCounter.value += 1;
  // +92 300 000 0001 ..: not issued to any subscriber, so never a real person.
  return `+92300000${String(phoneCounter.value).padStart(4, "0")}`;
}

const AGENCY_BLUEPRINTS = [
  {
    key: "a",
    name: "EstateOS Test Agency A",
    slug: `${TEST_AGENCY_SLUG_PREFIX}agency-a`,
    codePrefix: "TESTA",
    planName: "Free",
    city: "Lahore",
    // The Free-plan agency is the one --scenario free-plan-overflow pushes past
    // its caps, so the plan-limit guards can be exercised.
    overflow: true,
    counts: { properties: 4, leads: 10, visits: 5, checkins: 5, conversations: 3 },
  },
  {
    key: "b",
    name: "EstateOS Test Agency B",
    slug: `${TEST_AGENCY_SLUG_PREFIX}agency-b`,
    codePrefix: "TESTB",
    planName: "Professional",
    city: "Karachi",
    overflow: false,
    counts: { properties: 8, leads: 14, visits: 9, checkins: 9, conversations: 4 },
  },
];

const ENTERPRISE_BLUEPRINT = {
  key: "c",
  name: "EstateOS Test Agency C",
  slug: `${TEST_AGENCY_SLUG_PREFIX}agency-c`,
  codePrefix: "TESTC",
  planName: "Enterprise",
  city: "Islamabad",
  overflow: false,
  counts: { properties: 6, leads: 12, visits: 7, checkins: 7, conversations: 3 },
};

/** The one scenario that is allowed to exceed a plan: the Free-plan agency. */
const FREE_OVERFLOW_COUNTS = {
  properties: 8,
  leads: 30,
  visits: 12,
  checkins: 6,
  conversations: 3,
};

/** Set by the gate; the top-level catch scrubs these from every error. */
let secretValues = [];

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    yes: false,
    scenario: "baseline",
    withEnterprise: false,
    envFile: undefined,
    overlayFile: undefined,
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--yes" || arg === "-y") args.yes = true;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (arg === "--with-enterprise") args.withEnterprise = true;
    else if (arg.startsWith("--scenario=")) args.scenario = arg.slice("--scenario=".length);
    else if (arg === "--scenario") args.scenario = argv[++i];
    else if (arg.startsWith("--env=")) args.envFile = arg.slice("--env=".length);
    else if (arg === "--env") args.envFile = argv[++i];
    // NOT "--env-file": that is Node's own flag (node --env-file=...) and the
    // runtime would swallow it before this script ever saw it.
    else if (arg.startsWith("--overlay-file="))
      args.overlayFile = arg.slice("--overlay-file=".length);
    else if (arg === "--overlay-file") args.overlayFile = argv[++i];
    else {
      console.error(`Unknown option: ${arg}\n`);
      printHelp();
      process.exit(2);
    }
  }
  if (args.scenario !== "baseline" && args.scenario !== "free-plan-overflow") {
    console.error(
      `Unknown scenario: "${args.scenario}" (expected baseline or free-plan-overflow)\n`,
    );
    printHelp();
    process.exit(2);
  }
  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/seed-test-data.mjs [options]

Options:
  --yes, -y            Skip the interactive project-ref confirmation.
  --scenario <name>    baseline (default) | free-plan-overflow
                       free-plan-overflow deliberately pushes the Free-plan
                       agency past its plan limits, for testing the guard UI.
  --with-enterprise    Also seed an Enterprise-plan agency (off by default).
  --env <path>         Read the .env values from another file (default .env).
  --overlay-file <p>   Extra file that may only add SEED_ALLOWED_PROJECT_REF
                       and SEED_TEST_PASSWORD.
  --help, -h           Show this help.

The project-ref allow-list check always applies, whatever the options.`);
}

// ---------------------------------------------------------------------------
// Deterministic date helper
// ---------------------------------------------------------------------------

/** ISO timestamp `days` from the fixed anchor at `hour`:`minute` UTC. */
function isoAt(days, hour = 9, minute = 0) {
  return new Date(SEED_ANCHOR + days * DAY + hour * 3_600_000 + minute * 60_000).toISOString();
}

function countsFor(blueprint, scenario) {
  return scenario === "free-plan-overflow" && blueprint.overflow
    ? FREE_OVERFLOW_COUNTS
    : blueprint.counts;
}

// ---------------------------------------------------------------------------
// Row builders -- one function per table, so every shape lives in one place.
// ---------------------------------------------------------------------------

function buildUserSpecs(blueprints) {
  const specs = [
    {
      email: `superadmin.1@${TEST_EMAIL_DOMAIN}`,
      agencyKey: null,
      role: "super_admin",
      jobTitle: "Platform Owner",
    },
    {
      email: `unassigned.1@${TEST_EMAIL_DOMAIN}`,
      agencyKey: null,
      role: null,
      jobTitle: "Pending assignment",
    },
  ];
  const prefixes = { a: "agencya", b: "agencyb", c: "agencyc" };
  for (const bp of blueprints) {
    const prefix = prefixes[bp.key];
    specs.push({
      email: `${prefix}.admin.1@${TEST_EMAIL_DOMAIN}`,
      agencyKey: bp.key,
      role: "agency_admin",
      jobTitle: "Agency Admin",
    });
    for (const n of [1, 2]) {
      specs.push({
        email: `${prefix}.employee.${n}@${TEST_EMAIL_DOMAIN}`,
        agencyKey: bp.key,
        role: "employee",
        jobTitle: n === 1 ? "Property Consultant" : "Sales Executive",
      });
    }
  }
  return specs;
}

function buildAgency(bp) {
  const city = CITIES.find((c) => c.city === bp.city);
  return {
    slug: bp.slug,
    name: bp.name,
    phone: nextPhone(),
    whatsapp_number: nextPhone(),
    email: `office.${bp.key}@${TEST_EMAIL_DOMAIN}`,
    office_address: `Office 4, ${bp.codePrefix} Plaza, ${city.societies[0]}, ${city.city}`,
    cities_served: [city.city],
    description: `Seeded test agency on the ${bp.planName} plan. Generated by scripts/seed-test-data.mjs.`,
    working_hours: "Mon-Sat 10:00-19:00",
    status: "active",
  };
}

function buildWhatsappConfig(bp) {
  return {
    whatsapp_number: nextPhone(),
    display_name: `${bp.name} WhatsApp`,
    connection_status: "connected",
    ai_enabled: true,
    ai_greeting: `Assalam-o-Alaikum! Welcome to ${bp.name}. How can we help you find a property?`,
    ai_language: "auto",
    ai_tone: "polite and professional",
    ai_instructions:
      "Answer in the customer's language. Never invent prices, availability or plot numbers. " +
      "Offer a site visit and hand over to a human agent when the customer asks.",
    handoff_keywords: ["human", "agent", "call me", "manager"],
    auto_create_leads: true,
    last_connected_at: isoAt(-3),
  };
}

/**
 * Assignment pattern: employee 1, employee 2, the agency admin, then an
 * unassigned row, repeating. So every agency always ends up with at least one
 * property/lead per employee and at least one unassigned row.
 */
function assigneeFor(index, team) {
  const pattern = [team[1] ?? team[0], team[2] ?? team[0], team[0], null];
  return pattern[index % pattern.length];
}

function buildProperties(bp, agencyId, team, counts) {
  const city = CITIES.find((c) => c.city === bp.city);
  const rows = [];
  for (let i = 0; i < counts.properties; i++) {
    const type = PROPERTY_TYPES[i % PROPERTY_TYPES.length];
    const purpose = i % 4 === 3 ? "rent" : "sale";
    const society = faker.helpers.arrayElement(city.societies);
    const locality = faker.helpers.arrayElement(city.localities);
    const areaValue = faker.helpers.arrayElement([3, 5, 7, 10, 14, 20]);
    const areaUnit = faker.helpers.arrayElement(["marla", "kanal", "sqft"]);
    const bedrooms =
      type === "house" || type === "apartment" ? faker.number.int({ min: 2, max: 6 }) : null;
    const ownerName = fakePersonName(faker);
    rows.push({
      agency_id: agencyId,
      reference_code: `${bp.codePrefix}-P${String(i + 1).padStart(2, "0")}`,
      title: `${areaValue} ${areaUnit} ${PROPERTY_TYPE_LABELS[type]} in ${society}, ${city.city}`,
      property_type: type,
      purpose,
      status: "available",
      price_pkr: faker.number.int({ min: 1, max: 950 }) * 1_000_000,
      area_value: areaValue,
      area_unit: areaUnit,
      city: city.city,
      province: city.province,
      division: city.division,
      district: city.district,
      tehsil: city.tehsil,
      society,
      locality,
      phase_block: `Block ${faker.helpers.arrayElement(["A", "B", "C", "D", "E"])}`,
      block: null,
      address: `House ${faker.number.int({ min: 1, max: 400 })}, Street ${faker.number.int({ min: 1, max: 20 })}, ${society}, ${city.city}`,
      latitude: city.lat + faker.number.float({ min: -0.05, max: 0.05, fractionDigits: 6 }),
      longitude: city.lng + faker.number.float({ min: -0.05, max: 0.05, fractionDigits: 6 }),
      bedrooms,
      bathrooms: bedrooms ? faker.number.int({ min: 1, max: bedrooms }) : null,
      furnished: purpose === "rent" && faker.datatype.boolean(),
      rent_period: purpose === "rent" ? faker.helpers.arrayElement(["monthly", "yearly"]) : null,
      description: `Seeded demo listing on the ${bp.planName} plan. ${faker.lorem.sentence()}`,
      features: faker.helpers.arrayElements(FEATURES, { min: 2, max: 4 }),
      owner_name: ownerName,
      owner_phone: nextPhone(),
      tenant_name: purpose === "rent" ? fakePersonName(faker) : null,
      tenant_phone: purpose === "rent" ? nextPhone() : null,
      realtor_name: faker.datatype.boolean() ? fakePersonName(faker) : null,
      realtor_phone: faker.datatype.boolean() ? nextPhone() : null,
      assigned_to: assigneeFor(i, team),
      created_by: team[0],
      created_at: isoAt(-faker.number.int({ min: 1, max: 60 })),
    });
  }
  return rows;
}

function buildLeads(bp, agencyId, team, counts, properties) {
  const city = CITIES.find((c) => c.city === bp.city);
  const statuses = [
    "new",
    "contacted",
    "qualified",
    "visit_scheduled",
    "negotiating",
    "won",
    "lost",
  ];
  const rows = [];
  for (let i = 0; i < counts.leads; i++) {
    const property = properties[i % properties.length];
    rows.push({
      agency_id: agencyId,
      name: fakePersonName(faker),
      phone: nextPhone(),
      whatsapp_number: nextPhone(),
      requirement_text: `${faker.helpers.arrayElement([3, 5, 7, 10])} marla ${faker.helpers.arrayElement(["house", "plot", "apartment"])} in ${city.city}`,
      budget_min_pkr: faker.number.int({ min: 2, max: 60 }) * 1_000_000,
      budget_max_pkr: faker.number.int({ min: 61, max: 200 }) * 1_000_000,
      preferred_city: city.city,
      preferred_locality: property.society,
      property_type: property.property_type,
      purpose: property.purpose,
      status: statuses[i % statuses.length],
      assigned_to: assigneeFor(i, team),
      notes: `Seeded lead ${i + 1} for ${bp.name}.`,
      created_at: isoAt(-faker.number.int({ min: 1, max: 90 })),
    });
  }
  return rows;
}

function buildVisits(bp, agencyId, team, counts, leads, properties) {
  const rows = [];
  for (let i = 0; i < counts.visits; i++) {
    const lead = leads[i % leads.length];
    const property = properties[i % properties.length];
    const status = faker.helpers.arrayElement([
      "requested",
      "confirmed",
      "completed",
      "cancelled",
      "no_show",
    ]);
    rows.push({
      agency_id: agencyId,
      lead_id: lead.id,
      property_id: property.id,
      assigned_to: i % 5 === 4 ? null : assigneeFor(i, team),
      status,
      requested_at: isoAt(-14),
      scheduled_at: isoAt(-14 + i, 12),
      confirmed: status === "confirmed" || status === "completed",
      notes: `Seeded visit for ${lead.name} at ${property.title}.`,
      created_at: isoAt(-14),
    });
  }
  return rows;
}

function buildCheckins(bp, agencyId, team, counts, properties) {
  const rows = [];
  for (let i = 0; i < counts.checkins; i++) {
    const property = properties[i % properties.length];
    const contactType = faker.helpers.arrayElement(["owner", "tenant", "realtor"]);
    // contact_phone is NOT NULL: fall back to the owner whenever the chosen
    // contact does not exist on this property (non-rental has no tenant).
    const contactName =
      contactType === "owner"
        ? property.owner_name
        : contactType === "tenant"
          ? (property.tenant_name ?? property.owner_name)
          : (property.realtor_name ?? property.owner_name);
    const contactPhone =
      contactType === "owner"
        ? property.owner_phone
        : contactType === "tenant"
          ? (property.tenant_phone ?? property.owner_phone)
          : (property.realtor_phone ?? property.owner_phone);
    const status = faker.helpers.arrayElement([
      "scheduled",
      "sent",
      "responded",
      "failed",
      "skipped",
    ]);
    rows.push({
      agency_id: agencyId,
      assigned_to: i % 4 === 3 ? null : assigneeFor(i, team),
      property_id: property.id,
      contact_type: contactType,
      contact_name: contactName,
      contact_phone: contactPhone,
      channel: faker.helpers.arrayElement(["whatsapp", "sms"]),
      scheduled_for: isoAt(i - counts.checkins, 15),
      status,
      sent_at:
        status === "scheduled" || status === "skipped" ? null : isoAt(i - counts.checkins, 15, 2),
      response_text: status === "responded" ? "Family has shifted out, the flat is vacant." : null,
      property_condition:
        status === "responded"
          ? faker.helpers.arrayElement(["good", "needs repair", "excellent"])
          : null,
      is_vacant: status === "responded" ? faker.datatype.boolean() : null,
      provider_error: status === "failed" ? "Twilio sandbox: test number not verified." : null,
      created_by: team[0],
      created_at: isoAt(-counts.checkins - 1),
    });
  }
  return rows;
}

function buildConversations(bp, agencyId, team, counts, leads, properties) {
  const rows = [];
  for (let i = 0; i < counts.conversations; i++) {
    const lead = leads[(i * 3) % leads.length];
    const property = properties[(i * 2) % properties.length];
    const state = faker.helpers.arrayElement(["ai_active", "human_active", "closed"]);
    rows.push({
      agency_id: agencyId,
      customer_phone: nextPhone(),
      customer_name: lead.name,
      lead_id: lead.id,
      state,
      handoff_requested: state === "human_active",
      handoff_reason: state === "human_active" ? "Customer asked for a human agent." : null,
      assigned_to: i % 3 === 2 ? null : assigneeFor(i, team),
      last_message_at: isoAt(-1, 16),
      created_at: isoAt(-2, 10),
      // Stripped before the conversation row is written.
      _messages: [
        {
          sender: "customer",
          body: `Assalam-o-Alaikum, is ${property.title} still available?`,
          referenced_property_id: property.id,
          created_at: isoAt(-2, 10, 5),
        },
        {
          sender: "ai",
          body: "Walaikum-assalam! Yes, it is available. Would you like to schedule a visit?",
          referenced_property_id: property.id,
          created_at: isoAt(-2, 10, 7),
        },
        {
          sender: "customer",
          body: "Yes please. Can we come on Saturday?",
          referenced_property_id: null,
          created_at: isoAt(-2, 11, 2),
        },
        {
          sender: "employee",
          body: "Saturday 4 PM works. I will confirm the address on WhatsApp.",
          referenced_property_id: null,
          created_at: isoAt(-1, 16),
        },
      ],
    });
  }
  return rows;
}

function buildMedia(agencyId, properties) {
  const rows = [];
  for (const property of properties) {
    // Exactly one cover photo per property: property_media_one_cover_idx is a
    // partial unique index on (property_id) WHERE is_cover.
    rows.push({
      agency_id: agencyId,
      property_id: property.id,
      kind: "photo",
      storage_path: `${agencyId}/${property.id}/cover.jpg`,
      caption: `Cover photo of ${property.title}`,
      sort_order: 0,
      is_cover: true,
      mime_type: "image/jpeg",
      size_bytes: faker.number.int({ min: 90_000, max: 900_000 }),
    });
    if (faker.datatype.boolean(0.4)) {
      rows.push({
        agency_id: agencyId,
        property_id: property.id,
        kind: "photo",
        storage_path: `${agencyId}/${property.id}/interior-1.jpg`,
        caption: "Interior view",
        sort_order: 1,
        is_cover: false,
        mime_type: "image/jpeg",
        size_bytes: faker.number.int({ min: 90_000, max: 900_000 }),
      });
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Write helpers
// ---------------------------------------------------------------------------

/**
 * resolve-then-insert. `criteria` is the natural key that makes the row
 * identifiable on a second run; `values` is the payload written either way.
 */
async function upsert(supabase, table, criteria, values) {
  let query = supabase.from(table).select("id").limit(1);
  for (const [column, value] of Object.entries(criteria)) {
    query = value === null ? query.is(column, null) : query.eq(column, value);
  }
  const { data: found, error: findError } = await query;
  if (findError) throw new Error(`${table} lookup failed: ${findError.message}`);

  if (found && found.length > 0) {
    const { error: updateError } = await supabase.from(table).update(values).eq("id", found[0].id);
    if (updateError) throw new Error(`${table} update failed: ${updateError.message}`);
    return { id: found[0].id, created: false };
  }
  const { data, error } = await supabase.from(table).insert(values).select("id").single();
  if (error) throw new Error(`${table} insert failed: ${error.message}`);
  return { id: data.id, created: true };
}

function track(stats, table, result) {
  stats[table] ??= { created: 0, updated: 0 };
  if (result.created) stats[table].created += 1;
  else stats[table].updated += 1;
}

async function countExact(supabase, table, column, value) {
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq(column, value);
  if (error) throw new Error(`${table} count failed: ${error.message}`);
  return count ?? 0;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv);
  const blueprints = args.withEnterprise
    ? [...AGENCY_BLUEPRINTS, ENTERPRISE_BLUEPRINT]
    : AGENCY_BLUEPRINTS;

  const { supabase, values, secrets, target } = await openTestDataClient({
    scriptName: "seed-test-data",
    purpose: [
      `deterministic seed (faker seed ${FIXED_SEED}, scenario "${args.scenario}")`,
      `creates only @${TEST_EMAIL_DOMAIN} accounts and ${TEST_AGENCY_SLUG_PREFIX}* agencies`,
    ],
    yes: args.yes,
    envFile: args.envFile,
    overlayFile: args.overlayFile,
  });
  secretValues = secrets;

  faker.seed(FIXED_SEED);

  const password = values.SEED_TEST_PASSWORD;
  if (!password) {
    throw new Error("SEED_TEST_PASSWORD is not set in .env -- refusing to create test accounts.");
  }

  // Plans are seeded by migration 0006; the seed only reads them. Inventing a
  // plan would silently move an agency onto a different limit set.
  const { data: plans, error: plansError } = await supabase
    .from("plans")
    .select("id, name")
    .in("name", [...new Set(blueprints.map((bp) => bp.planName))]);
  if (plansError) throw new Error(`plans lookup failed: ${plansError.message}`);
  const planByName = new Map((plans ?? []).map((p) => [p.name, p.id]));
  for (const bp of blueprints) {
    if (!planByName.has(bp.planName)) {
      throw new Error(`Plan "${bp.planName}" not found in public.plans. Migration 0006 seeds it.`);
    }
  }

  const stats = {};
  const userSpecs = buildUserSpecs(blueprints);

  // ---- users -------------------------------------------------------------
  // createUser fires handle_new_user (0000), which inserts a bare profile row
  // with agency_id NULL and the metadata we pass. We then UPDATE that row
  // through the service-role client -- the one context
  // protect_profile_privileged_columns (0001) allows to set agency_id.
  const usersByEmail = new Map();
  for (const spec of userSpecs) {
    const fullName = fakePersonName(faker);
    const phone = nextPhone();

    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email: spec.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, phone },
    });

    let userId;
    if (createError) {
      const message = createError.message.toLowerCase();
      const alreadyExists =
        message.includes("already") || message.includes("registered") || message.includes("exists");
      if (!alreadyExists) {
        throw new Error(`createUser failed for ${spec.email}: ${createError.message}`);
      }
      // Idempotency: the account exists from an earlier run -- resolve it.
      const { data: list, error: listError } = await supabase.auth.admin.listUsers({
        page: 1,
        perPage: 200,
      });
      if (listError) throw new Error(`listUsers failed: ${listError.message}`);
      const found = (list?.users ?? []).find(
        (u) => u.email?.toLowerCase() === spec.email.toLowerCase(),
      );
      if (!found) throw new Error(`${spec.email} exists but could not be found to link.`);
      userId = found.id;
      track(stats, "auth.users", { created: false });
    } else {
      if (!created?.user) throw new Error(`createUser returned no user for ${spec.email}.`);
      userId = created.user.id;
      track(stats, "auth.users", { created: true });
    }

    usersByEmail.set(spec.email, { id: userId, fullName, phone, spec });
  }

  // ---- agencies ----------------------------------------------------------
  const agencyByKey = new Map();
  for (const bp of blueprints) {
    const agencyResult = await upsert(supabase, "agencies", { slug: bp.slug }, buildAgency(bp));
    track(stats, "agencies", agencyResult);
    agencyByKey.set(bp.key, { ...bp, id: agencyResult.id });

    const subResult = await upsert(
      supabase,
      "subscriptions",
      { agency_id: agencyResult.id },
      {
        agency_id: agencyResult.id,
        plan_id: planByName.get(bp.planName),
        status: "active",
        trial_ends_at: null,
        current_period_start: isoAt(0),
        current_period_end: isoAt(30),
      },
    );
    track(stats, "subscriptions", subResult);

    const configResult = await upsert(
      supabase,
      "whatsapp_configs",
      { agency_id: agencyResult.id },
      { agency_id: agencyResult.id, ...buildWhatsappConfig(bp) },
    );
    track(stats, "whatsapp_configs", configResult);
  }

  // ---- profiles + roles --------------------------------------------------
  for (const spec of userSpecs) {
    const user = usersByEmail.get(spec.email);
    const agency = spec.agencyKey ? agencyByKey.get(spec.agencyKey) : null;
    const profileResult = await upsert(
      supabase,
      "profiles",
      { id: user.id },
      {
        id: user.id,
        agency_id: agency ? agency.id : null,
        full_name: user.fullName,
        phone: user.phone,
        email: spec.email,
        job_title: spec.jobTitle,
        status: "active",
      },
    );
    track(stats, "profiles", profileResult);

    if (spec.role) {
      const roleResult = await upsert(
        supabase,
        "user_roles",
        { user_id: user.id, role: spec.role },
        {
          user_id: user.id,
          role: spec.role,
          // super_admin carries no agency_id: it is a platform-level role.
          agency_id: agency ? agency.id : null,
        },
      );
      track(stats, "user_roles", roleResult);
    }
  }

  // ---- per-agency data ---------------------------------------------------
  const summary = [];
  for (const bp of blueprints) {
    const agency = agencyByKey.get(bp.key);
    const counts = countsFor(bp, args.scenario);
    const team = userSpecs
      .filter((s) => s.agencyKey === bp.key)
      .map((s) => usersByEmail.get(s.email).id);

    // Properties first: visits, check-ins, media and conversations link to them.
    const properties = [];
    for (const row of buildProperties(bp, agency.id, team, counts)) {
      const result = await upsert(
        supabase,
        "properties",
        { agency_id: agency.id, reference_code: row.reference_code },
        row,
      );
      track(stats, "properties", result);
      properties.push({ ...row, id: result.id });
    }

    const leads = [];
    for (const row of buildLeads(bp, agency.id, team, counts, properties)) {
      const result = await upsert(
        supabase,
        "leads",
        { agency_id: agency.id, phone: row.phone },
        row,
      );
      track(stats, "leads", result);
      leads.push({ ...row, id: result.id });
    }

    for (const row of buildVisits(bp, agency.id, team, counts, leads, properties)) {
      const result = await upsert(
        supabase,
        "site_visits",
        {
          agency_id: agency.id,
          lead_id: row.lead_id,
          property_id: row.property_id,
          scheduled_at: row.scheduled_at,
        },
        row,
      );
      track(stats, "site_visits", result);
    }

    for (const row of buildCheckins(bp, agency.id, team, counts, properties)) {
      const result = await upsert(
        supabase,
        "property_checkins",
        {
          agency_id: agency.id,
          property_id: row.property_id,
          contact_type: row.contact_type,
          scheduled_for: row.scheduled_for,
        },
        row,
      );
      track(stats, "property_checkins", result);
    }

    for (const convo of buildConversations(bp, agency.id, team, counts, leads, properties)) {
      const { _messages: messages, ...row } = convo;
      const result = await upsert(
        supabase,
        "conversations",
        { agency_id: agency.id, customer_phone: row.customer_phone },
        row,
      );
      track(stats, "conversations", result);
      for (const message of messages) {
        const messageResult = await upsert(
          supabase,
          "conversation_messages",
          { agency_id: agency.id, conversation_id: result.id, body: message.body },
          { agency_id: agency.id, conversation_id: result.id, ...message },
        );
        track(stats, "conversation_messages", messageResult);
      }
    }

    for (const row of buildMedia(agency.id, properties)) {
      const result = await upsert(
        supabase,
        "property_media",
        { agency_id: agency.id, property_id: row.property_id, storage_path: row.storage_path },
        row,
      );
      track(stats, "property_media", result);
    }

    summary.push({
      agency,
      counts,
      properties: properties.length,
      leads: leads.length,
      overflow: args.scenario === "free-plan-overflow" && bp.overflow,
    });
  }

  // ---- tail summary ------------------------------------------------------
  console.log("\nWrote (created / updated -- a re-run updates, never duplicates):");
  for (const [table, c] of Object.entries(stats)) {
    console.log(
      `  ${table.padEnd(24)} ${String(c.created).padStart(3)} created  ${String(c.updated).padStart(3)} updated`,
    );
  }

  console.log("\nPer agency:");
  for (const row of summary) {
    const { data: limitValue } = await supabase.rpc("plan_limit_for_agency", {
      _agency_id: row.agency.id,
      _metric_key: "properties",
    });
    const limit =
      limitValue === null || limitValue === undefined
        ? "no subscription"
        : Number(limitValue) < 0
          ? "unlimited"
          : String(limitValue);
    console.log(
      `  ${row.agency.name.padEnd(24)} plan=${String(row.agency.planName).padEnd(13)} ` +
        `properties=${row.properties} (plan limit ${limit}) leads=${row.leads} ` +
        `visits=${row.counts.visits} checkins=${row.counts.checkins} ` +
        `conversations=${row.counts.conversations}` +
        (row.overflow ? "   <-- free-plan-overflow scenario" : ""),
    );
  }

  if (args.scenario === "free-plan-overflow") {
    console.log(
      "\nWARNING: --scenario free-plan-overflow deliberately pushed the Free-plan agency past its\n" +
        "limits so the plan-limit guard and the 'at limit' indicators can be exercised. Do not\n" +
        "leave this state in a project you are demoing from.",
    );
  }

  // Free-plan guard: agency A must stay inside the Free plan's caps unless the
  // overflow scenario is on. The 0008 trigger skips service_role writes, so
  // this check is what keeps the seed honest about the plan it claims.
  const freeAgency = summary.find((r) => r.agency.planName === "Free");
  if (freeAgency && !freeAgency.overflow) {
    const { data: features, error: featuresError } = await supabase
      .from("plan_features")
      .select("feature_key, limit_value")
      .eq("plan_id", planByName.get("Free"))
      .in("feature_key", ["properties", "leads"]);
    if (featuresError) throw new Error(`plan_features lookup failed: ${featuresError.message}`);
    const maxProps = Number(
      features?.find((f) => f.feature_key === "properties")?.limit_value ?? -1,
    );
    const maxLeads = Number(features?.find((f) => f.feature_key === "leads")?.limit_value ?? -1);
    if (maxProps >= 0 && freeAgency.properties > maxProps) {
      throw new Error(
        `Free-plan guard: ${freeAgency.agency.name} has ${freeAgency.properties} properties, ` +
          `but the Free plan allows ${maxProps}.`,
      );
    }
    if (maxLeads >= 0 && freeAgency.leads > maxLeads) {
      throw new Error(
        `Free-plan guard: ${freeAgency.agency.name} has ${freeAgency.leads} leads, ` +
          `but the Free plan allows ${maxLeads}.`,
      );
    }
  }

  const teamCount = await Promise.all(
    summary.map(async (row) =>
      countExact(supabase, "profiles", "agency_id", row.agency.id).then((n) => ({ n, row })),
    ),
  );
  const over = teamCount.find((t) => t.row.agency.planName === "Free" && t.n > 2);
  if (over) {
    console.log(
      `\nNOTE: ${over.row.agency.name} has ${over.n} team members. The Free plan's team_members\n` +
        "limit is 2; agency A is intentionally at 3/2 so the 'at limit' UI state can be tested.",
    );
  }

  console.log(
    `\nDone: ${userSpecs.length} test accounts, ${blueprints.length} agencies. ` +
      `Password came from SEED_TEST_PASSWORD (never printed).`,
  );
  console.log(`Project: ${target.ref} (${target.host}).`);
  console.log(`Clear with: node scripts/clear-test-data.mjs --yes\n`);
}

try {
  await main();
} catch (e) {
  console.error(`\nFAILED: ${redact(e instanceof Error ? e.message : String(e), secretValues)}\n`);
  process.exit(1);
}
