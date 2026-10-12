# Routes

TanStack Start uses **file-based routing**. Every `.tsx` file in this directory
defines a route. Do **not** create `src/pages/`, `src/routes/_app/index.tsx`, or
`app/layout.tsx` — those are Next.js / Remix conventions. The only root layout
is `src/routes/__root.tsx`.

## Conventions

| File                     | URL                                                     |
| ------------------------ | ------------------------------------------------------- |
| `index.tsx`              | `/`                                                     |
| `about.tsx`              | `/about`                                                |
| `users/index.tsx`        | `/users`                                                |
| `users/$id.tsx`          | `/users/:id` (dynamic — bare `$`, no curly braces)      |
| `posts/{-$category}.tsx` | `/posts/:category?` (optional segment)                  |
| `files/$.tsx`            | `/files/*` (splat — read via `_splat` param, never `*`) |
| `_layout.tsx`            | layout route (renders children via `<Outlet />`)        |
| `__root.tsx`             | app shell — wraps every page; preserve `<Outlet />`     |

`routeTree.gen.ts` is auto-generated. Don't edit it by hand.

# Test data seeding

Two node scripts create and remove a fixed set of demo records so the app can
be exercised with realistic Pakistani real-estate data. They are deterministic:
the random generator is seeded with a constant, timestamps come from a fixed
anchor, and every natural key is derived from a counter, so **running the seed
twice updates the same rows instead of creating duplicates**.

```bash
# 1. Fill in .env (git-ignored) -- see .env.example for the two new values
#    SEED_ALLOWED_PROJECT_REF=   must equal the ref inside SUPABASE_URL
#    SEED_TEST_PASSWORD=         throwaway password for the fake accounts

# 2. Seed (prints the project ref and asks you to type it back)
node scripts/seed-test-data.mjs

# 3. --yes skips the confirmation for non-interactive runs
node scripts/seed-test-data.mjs --yes

# 4. Scenario that intentionally exceeds the Free plan
node scripts/seed-test-data.mjs --yes --scenario free-plan-overflow

# 5. Optional extra agency on the Enterprise plan
node scripts/seed-test-data.mjs --yes --with-enterprise

# 6. Remove everything the seed created
node scripts/clear-test-data.mjs --yes
```

## Project-ref safety interlock

Both scripts read `SUPABASE_URL` from `.env`, parse the project ref out of it
(the first label of the Supabase host), and **refuse to run** unless
`SEED_ALLOWED_PROJECT_REF` equals that ref. No flag, environment variable or
default can point them at a different project: `SUPABASE_URL` and the
service-role key are only ever read from `.env`.

The ref is printed before anything is sent. Unless `--yes` is passed the script
then waits for you to type that ref back; on a non-TTY stdin without `--yes` it
refuses rather than hanging. `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` and
`SEED_TEST_PASSWORD` are never printed, in full or in part, and every error
message is scrubbed through a redaction pass before it reaches the terminal.

## What gets created

|            |                                                                                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accounts   | 1 super admin, and per agency 1 agency admin + 2 employees, all at `@test.estateos.local`, plus 1 unassigned account                                                |
| Agencies   | `test-agency-a` on the **Free** plan, `test-agency-b` on **Professional**, and optionally `test-agency-c` on **Enterprise**                                         |
| Per agency | properties (some assigned to each employee, some unassigned), leads, site visits, property check-ins, conversations with messages, and one cover photo per property |

Every phone number is drawn from the reserved test-only block
`+92 300 000 0001`–`+92 300 000 9999`, which is not issued to subscribers, so
none of them can belong to a real person. Names, cities, societies and
localities come from `scripts/lib/test-data-content.mjs`; nothing is generated
from a general-purpose name or phone list, and no real person is fabricated.

The seed works with the database's existing rules rather than around them:

- `handle_new_user` (migration 0000) creates a bare profile row on signup, so
  the seed creates the account and then **updates** that row.
- `protect_profile_privileged_columns` (0001) blocks `agency_id` changes from
  anywhere except a super admin or `service_role` — the seed writes profiles
  through the service-role client.
- `enforce_plan_limit` (0008) skips `service_role` writes, so the seed keeps
  the Free-plan agency inside its caps **by count** and reports the numbers.
  Agency A carries 3 team members against the Free plan's limit of 2, on
  purpose, so the "at limit" indicator on the usage page can be seen.
- `validate_*_links` (0004) rejects a row that references another agency's
  lead, property or conversation, so every link is taken from the same agency.
- `property_media_one_cover_idx` (0005) allows one cover photo per property.

## What the clear script deletes

Only these, and nothing else:

- auth users whose email ends in `@test.estateos.local`;
- agencies whose slug starts with `test-` **and** whose profiles all belong to
  those test users — an agency with even one non-test profile is skipped and
  reported;
- every row in those agencies, deleted children-first in a FK-safe order;
- the storage objects under those agencies in the `property-media` bucket.

`platform_bootstrap` is never touched, and no user outside the test domain is
ever modified or deleted. Deletions are counted per table and printed.

## Idempotency

Each table has a documented natural key that the seed resolves before writing,
which is what makes a second run a no-op:

| Table                               | Resolved by                                  |
| ----------------------------------- | -------------------------------------------- |
| `agencies`                          | `slug`                                       |
| `subscriptions`, `whatsapp_configs` | `agency_id`                                  |
| `profiles`                          | auth user id                                 |
| `user_roles`                        | `(user_id, role)`                            |
| `properties`                        | `(agency_id, reference_code)`                |
| `leads`                             | `(agency_id, phone)`                         |
| `site_visits`                       | `(lead_id, property_id, scheduled_at)`       |
| `property_checkins`                 | `(property_id, contact_type, scheduled_for)` |
| `conversations`                     | `(agency_id, customer_phone)`                |
| `conversation_messages`             | `(conversation_id, body)`                    |
| `property_media`                    | `(property_id, storage_path)`                |

Auth accounts are matched by email, so a re-run reuses them rather than
creating a second account with the same address.

## Options

| Flag                            | Effect                                                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `--yes`, `-y`                   | Skip the typed project-ref confirmation (the allow-list check still applies)                                        |
| `--scenario free-plan-overflow` | Deliberately push the Free-plan agency past its plan limits, for testing the limit guards and "at limit" indicators |
| `--with-enterprise`             | Also seed an Enterprise-plan agency                                                                                 |
| `--env <path>`                  | Read the `.env` values from another file (default `.env`)                                                           |
| `--overlay-file <path>`         | Extra file that may only contribute `SEED_ALLOWED_PROJECT_REF` and `SEED_TEST_PASSWORD`                             |

The only new dependency is `@faker-js/faker`, dev-only.
