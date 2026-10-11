# CLEANUP_LOG

Record of the Phase B cleanup pass. Each entry is a commit on branch
`chore/clean-stack`. Nothing here was deleted without prior approval, and
every commit was re-verified with `npx tsc --noEmit`, `npx eslint`,
`node test/run-tests.mjs` and `npm run build`.

## Baseline before this pass

Working tree carried the de-Lovable changes; verified green:

- `npx tsc --noEmit` — 0 errors
- `node test/run-tests.mjs` — 73 sections, 18 expected-error, PASS
- `npm run build` — 2128 client / 180 SSR / 2160 Nitro modules
- `npx eslint .` — 650 problems (this is what the pass set out to fix)

## Commits

| Commit | Change | Files |
|---|---|---|
| `baaf309` | *chore: remove Lovable, use native Vite + DATABASE_URL* (Phase A) | 24 |
| `555ed7c` | Delete `bun.lock`, `bunfig.toml`; keep npm | 2 deleted |
| `e30a043` | Delete commented-out import example in `client.ts` | 1 |
| `4ae78d2` | Delete 26 unused shadcn/ui components | 26 deleted |
| `4d87f71` | Run Prettier across the repo | 34 reformatted |

## 1. `bun.lock` and `bunfig.toml` (commit `555ed7c`)

**Why.** Two package managers in one repo; `bun.lock` still referenced the
removed `@lovable.dev/*` packages (101 lines). npm is the only manager
actually used.

**Evidence.** `bun.lock` 172.9 kB with 101 `lovable` matches;
`package-lock.json` 301.6 kB with 0 matches; `bunfig.toml`'s only live
setting was `minimumReleaseAgeExcludes = []`.

**Verified after.** `npm ci` installs 429 packages cleanly from
`package-lock.json` alone.

## 2. Commented-out import (commit `e30a043`)

**Why.** `// import { supabase } from "@/integrations/supabase/client";`
sat above the lazy Proxy export in `src/integrations/supabase/client.ts`
and duplicated what the Proxy's own doc comment already says.

## 3. 26 unused shadcn/ui components (commit `4ae78d2`)

**Why.** 46 components existed; 26 were imported nowhere.

**How "unused" was proven.** The scan matches a component as used if its
module path appears in **any** file other than its own — which covers
static imports, `import()`, `export … from`, `export * from`, and
arbitrary string mentions. Before trusting a zero, the scan was run on
three known-positive controls (`button` 37 mentions, `select` 12,
`sonner` 1). All three were found, so the zeros were trustworthy.

**Deleted (26).** accordion, alert-dialog, aspect-ratio, avatar,
breadcrumb, calendar, carousel, chart, checkbox, collapsible, command,
context-menu, drawer, dropdown-menu, hover-card, input-otp, menubar,
navigation-menu, pagination, popover, radio-group, resizable,
scroll-area, sidebar, slider, toggle-group.

**Not deleted, deliberately.** `sheet`, `tooltip` and `toggle` were only
imported by sibling ui files that were themselves in the delete list, so
they became orphans one level down. They are flagged for the next pass
rather than removed silently.

**Result.** 46 → 20 components. Client CSS dropped 82.26 kB → 50.97 kB,
which is direct evidence their styles are gone rather than merely
unreferenced.

## 4. Orphaned dependencies — REPORTED, NOT REMOVED

After the deletion the dependency scan was re-run twice, because the
first version had two flaws that would have produced bad advice:

1. It counted `package.json` itself as a "reference", so nothing could
   ever look orphaned.
2. It missed **subpath imports** (`"drizzle-orm/pg-core"`,
   `"nitro/vite"`, `"@hookform/resolvers/zod"`), which briefly made
   `@hookform/resolvers`, `react-dom`, `nitro` and `drizzle-orm` look
   removable — removing any of which would break the build.

The corrected scan (declaration files excluded, subpaths matched) reports:

**Genuinely orphaned by step 3 (24):**

- 16 `@radix-ui/react-*`: accordion, alert-dialog, aspect-ratio, avatar,
  checkbox, collapsible, context-menu, dropdown-menu, hover-card,
  menubar, navigation-menu, popover, radio-group, scroll-area, slider,
  toggle-group
- `cmdk` (was command.tsx), `vaul` (drawer.tsx),
  `embla-carousel-react` (carousel.tsx), `react-day-picker` (calendar.tsx),
  `date-fns` (calendar.tsx), `input-otp` (input-otp.tsx),
  `react-resizable-panels` (resizable.tsx), `recharts` (chart.tsx)

**Reported but explicitly NOT recommended for removal** — framework and
toolchain, zero explicit references but required:

- `react-dom` — loaded by React 19 / TanStack Start at runtime
- `@types/node`, `@types/react`, `@types/react-dom` — type toolchain
- `typescript` — the compiler
- `drizzle-orm` — `drizzle/schema.ts` is intentionally blank (60 bytes,
  "auto-generated and intentionally left blank"), and `drizzle-kit`
  depends on it
- `@vitejs/plugin-react`, `@tanstack/router-plugin` — framework peers
- `eslint-config-prettier` — not referenced by `eslint.config.js`

Awaiting approval before removing anything.

## 5. Prettier (commit `4d87f71`)

**Why.** 650 `eslint .` problems, essentially all formatting drift.

**Changed.** 34 files — 27 route/component/lib files, both READMEs,
`styles.css`.

**Result.** 650 → **15 problems (11 errors, 4 warnings)**. The 11
remaining errors are the 10 `no-explicit-any` sites plus one
`prefer-const`; the 4 warnings are stock shadcn `react-refresh`
boilerplate. All left as a separate proposal.

## Not actioned, awaiting approval

- The 10 `no-explicit-any` fixes and 1 `prefer-const` (see the separate
  proposal).
- The 24 orphaned dependencies above.
- Root `README.md` replacement (deferred to Phase F).

## Held deliberately unchanged

- All nine SQL migrations, `drizzle/schema.ts`, the drizzle journal and
  snapshots.
- Every RLS policy, role check, plan-limit and audit-log construct.
- `test/run-tests.mjs` and the whole test battery.
- The `importProtection` guard in `vite.config.ts`.
- `src/server.ts`.
- `nitro@3.0.260603-beta`, `vite@8.1.5`, the `rolldown@1.2.1` override,
  and the mismatched TanStack minors (report-only, per instruction).
- The root `README.md` (generic TanStack routing template) — replaced in
  Phase F.
