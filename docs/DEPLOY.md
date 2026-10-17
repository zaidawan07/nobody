# Deploy

How a build becomes the live app, and how to operate it once it is up.

Scope: this file covers the build output, environment variables, deploying,
migrations, the health check, HTTP headers, and the service worker. Outstanding
work that has to happen before launch lives in `docs/PRELAUNCH.md`.

## Build output

```bash
npm run build      # vite build -> .output/
npm run dev        # dev server; no service worker, see below
```

Vite builds the client and SSR bundles, then Nitro writes the deployable
server to `.output/`:

| Path                           | What it is                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------------- |
| `.output/public/`              | static assets: `/assets/*`, `sw.js`, manifest, icons, favicon, robots.txt, `_headers` |
| `.output/server/index.mjs`     | the Worker entry                                                                      |
| `.output/server/wrangler.json` | generated Wrangler config (worker `zaidawan07-nobody`)                                |

The deploy target is the `NITRO_PRESET` environment variable, read in
`vite.config.ts`; it defaults to `cloudflare-module`. Switching the preset
changes the output format without touching application code.

## Environment variables

Two kinds, set in two different places. The full list of names, with
placeholders, is `.env.example`; `.env` itself is git-ignored.

**Build-time** — Vite inlines these into the client bundle, so they must be
present in the environment that runs `npm run build`. They are public by
design; row-level security is what protects the data:

| Variable                        | Notes                |
| ------------------------------- | -------------------- |
| `VITE_SUPABASE_URL`             | project URL          |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | publishable/anon key |

**Runtime** — read by the server bundle inside the Worker with `process.env`,
so they have to exist wherever it runs:

| Variable                    | Needed for                                              | If missing                                          |
| --------------------------- | ------------------------------------------------------- | --------------------------------------------------- |
| `SUPABASE_URL`              | every server-side Supabase call, admin client included  | throws on first use                                 |
| `SUPABASE_PUBLISHABLE_KEY`  | `requireSupabaseAuth`, i.e. every authenticated request | throws on first authenticated request               |
| `SUPABASE_SERVICE_ROLE_KEY` | admin operations (bypasses RLS)                         | throws on first admin call                          |
| `CRON_SECRET`               | authenticating `/api/cron/property-checkins`            | that endpoint returns 500 instead of doing anything |
| `CRON_SECRET_PREVIOUS`      | the other half of a cron-secret rotation                | optional, and only during a rotation                |

`SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are therefore needed twice over:
once at build time under their `VITE_` names, and once at runtime for the
server. Setting only the `VITE_` pair produces a working browser session and a
server that refuses every authenticated request.

**Optional runtime** — the feature degrades honestly rather than pretending:

| Variable                                                                            | Feature                 | Without it                                                             |
| ----------------------------------------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------- |
| `SMTP_HOST` or `RESEND_API_KEY`                                                     | invite emails           | invites are copy-paste only, which is the default and fully functional |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SMS_FROM`/`TWILIO_WHATSAPP_FROM` | property check-in sends | check-ins stay `scheduled`/`failed`, and are never recorded as `sent`  |

**Local tooling only — never needed by the deployed app:**

| Variable                                           | Used by                                                     |
| -------------------------------------------------- | ----------------------------------------------------------- |
| `DATABASE_URL`                                     | `scripts/apply-migrations.mjs`                              |
| `SEED_ALLOWED_PROJECT_REF`, `SEED_TEST_PASSWORD`   | `scripts/seed-test-data.mjs`, `scripts/clear-test-data.mjs` |
| `NITRO_PRESET`                                     | `vite.config.ts` (build)                                    |
| `BUNDLE_CHECK_ENV_FILE`, `BUNDLE_CHECK_PUBLIC_DIR` | `scripts/check-client-bundle.mjs`                           |

`DATABASE_URL` is a direct Postgres connection string and nothing else: the app
never opens one, so a Worker without it is fully functional. That is also why
the health check does not query the database.

Local status of `.env` in this working copy, by name only: the `SUPABASE_*` and
`VITE_SUPABASE_*` values, `DATABASE_URL`, `SEED_ALLOWED_PROJECT_REF` and
`SEED_TEST_PASSWORD` are set; every `TWILIO_*`, `CRON_SECRET` and
`CRON_SECRET_PREVIOUS` key is present but empty; `SMTP_HOST` and
`RESEND_API_KEY` are not present at all. `UNVERIFIED` — what is configured on
the deploy host cannot be read from this machine.

## Deploying

```bash
npm run build
npx wrangler deploy
```

The build emits the Worker (`.output/server/index.mjs`) and the static assets
(`.output/public/`), wired together by the generated
`.output/server/wrangler.json` — the worker name and the assets binding live
there, not in a hand-edited file. Nitro also writes
`.wrangler/deploy/config.json` at the repo root pointing at that config, which
is why `wrangler deploy` works from the root.

The end of a build also prints two other commands:

- `npx nitro deploy --prebuilt` — Nitro's own deploy path for the selected
  preset. `nitro` is a dev dependency, so this resolves locally; it ships the
  same artifacts as `wrangler deploy`.
- `npx vite preview` — serves the built output locally. It is a real production
  build, so it is the closest look at the deployed client short of deploying
  (and unlike `npm run dev`, the production-only paths such as service-worker
  registration are active). `npm run preview` is the same thing. Not exercised
  in this repo yet.

Use one of `npx wrangler deploy` or `npx nitro deploy`, not both, so it is
always clear which tool last touched the worker.

Wrangler is deliberately not a project dependency; `npx` fetches it on demand,
so it does not have to be installed anywhere. It does need a Cloudflare account
with access to the worker, authenticated beforehand with `npx wrangler login`
or a `CLOUDFLARE_API_TOKEN` in the environment.

Set the runtime secrets before the first deploy (names only — values belong in
the platform's secret store, never in the repo):

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_PUBLISHABLE_KEY
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put CRON_SECRET
```

The `VITE_*` pair is not a secret, but the build that runs before the deploy
still needs it in its environment — `.env` covers that on a local machine.

`UNVERIFIED` — no deploy has been run from this machine. The commands above are
Nitro's and Cloudflare's documented path, not something exercised here. A
deploy changes the live app, so it needs explicit sign-off first.

## Database migrations

Migrations are not part of the build and not part of the deploy. They are
applied separately, on purpose:

```bash
node scripts/apply-migrations.mjs --dry-run          # list what would run
node scripts/apply-migrations.mjs --from 0014        # a controlled batch
```

`drizzle-kit migrate` cannot be used for this project:
`drizzle/migrations/meta/_journal.json` tracks only `0000` and `0001`, so it
would replay those two and never reach the rest. The script applies the numbered
files directly instead.

On the live project `0000`–`0013` are applied, so `--from 0014` is the current
starting point; anything earlier would only replay migrations that already ran.
`--dry-run` prints the exact list without connecting. The whole batch runs in a
single transaction and rolls back on any error, so a failure cannot leave the
schema half-migrated.

Two rules:

- Applying anything to the live project changes production and needs explicit
  written sign-off. `0014`, `0015` and
  `drizzle/migrations/0016_no_subscription_uses_free_plan.sql` are written and
  tested locally but are **not applied**.
- Nothing links the two operations: a deploy does not apply migrations, and a
  migration does not deploy code. Either can be rolled back without the other.

`docs/PRELAUNCH.md` tracks which migrations are pending and what has to happen
before each one is safe to apply.

## Health check

`GET /api/health` answers whether the server is up, and nothing else:

```json
{ "ok": true, "status": "ok", "service": "estateos", "time": "...", "uptime_s": 12 }
```

It is unauthenticated and read-only, so it reveals nothing about the
deployment: no environment names, no versions, no build identifiers. It also
does **not** check the database, for the reason above — the app talks to
Supabase over HTTPS and never opens a Postgres connection, and an
unauthenticated endpoint that runs a query per request is an easy way to load
the database.

`uptime_s` is per Worker isolate and resets whenever the runtime recycles one,
so it is a hint, not a deploy timestamp.

Use it to confirm a deploy:

```bash
curl -fsS https://<host>/api/health
```

The response carries `cache-control: no-store`, so no proxy can answer with a
stale "ok".

## `_headers`

Cloudflare Workers serves `.output/public/` through a static-assets binding,
and honours the `_headers` file Nitro writes next to those assets:

```
/assets/*
  cache-control: public, max-age=31536000, immutable
/sw.js
  cache-control: no-cache, no-store, must-revalidate
```

`/assets/*` filenames are content-hashed, so holding them for a year is safe —
a release changes the filename, not the content behind it. `/sw.js` is the one
file that must never be held back: it is how an update to the service worker
reaches users, and any host or CDN that caches it delays that update for as
long as it cached it.

Both rules are declared once, in the `routeRules` block of `vite.config.ts`;
Nitro expands them into `_headers` during the build. Check after any build:

```bash
cat .output/public/_headers
```

## Service worker

`public/sw.js` caches static assets only — build output, icons, favicon,
manifest, robots.txt. It never caches HTML, `/api/*`, or server functions,
because every route in this app is tenant-scoped and a cached page would carry
one agency's data into the next session.

### Registered in production only

Registration lives in `src/components/pwa/useServiceWorker.ts` and runs behind
`import.meta.env.PROD`, so `npm run dev` never installs a worker. In dev the
same hook unregisters any leftover registration and deletes the caches, which
means a preview build served earlier can never shadow the dev server. There is
nothing to configure for this.

### Releases: bump `CACHE_VERSION`

`public/sw.js` opens its cache as `estateos-static-<CACHE_VERSION>`, and on
activation deletes every cache that is not its own. Bump the version constant
in `public/sw.js` as part of each release and the previous release's cache is
dropped on the next start — nothing accumulates.

The version is only a backstop for the caches. Non-hashed files (manifest,
icons, favicon, robots.txt) are revalidated on every use, so they are fresh
even if the bump is forgotten, and hashed `/assets/*` files change URL on every
release anyway.

### When users get an update

| What changed               | When it reaches a user                                                                       |
| -------------------------- | -------------------------------------------------------------------------------------------- |
| application code           | on the next load — the filenames changed                                                     |
| manifest / icons / favicon | on the load after the change — revalidated, may be one load behind if it changed mid-session |
| `sw.js` itself             | once every tab running the old version is closed                                             |
| a `CACHE_VERSION` bump     | at that same restart, when the new worker activates                                          |

The worker deliberately does not call `skipWaiting()`: taking over
mid-session would delete the cache entries the page on screen still needs.

### Verifying it is running

In a production build, DevTools → Application → Service Workers shows
`/sw.js` activated, and Application → Cache Storage lists one
`estateos-static-*` cache. Neither should ever appear for `npm run dev`.

## Emergency: turn the service worker off

If a service worker is ever serving something wrong, two ways out.

**One browser** — paste into the DevTools console (works in any browser):

```js
navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
caches
  .keys()
  .then((ks) => ks.filter((k) => k.startsWith("estateos-")).forEach((k) => caches.delete(k)));
```

In Chromium, the equivalent point-and-click path is DevTools → Application →
Service Workers → Unregister, followed by a reload. On iOS Safari, remove the
site's data (Settings → Safari → Advanced → Website Data) — iOS has no
DevTools console for most users.

**Every user, server-side** — the fastest fix is to replace `public/sw.js`
with this and deploy. It installs, unregisters itself, clears the caches it
owns, and reloads the open tabs:

```js
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n.startsWith("estateos-")).map((n) => caches.delete(n)),
      );
      await self.registration.unregister();
      const windows = await self.clients.matchAll({ type: "window" });
      await Promise.all(windows.map((client) => client.navigate(client.url)));
    })(),
  );
});
```

Deploying that file as `public/sw.js` reaches users as soon as their browser
picks up the new `/sw.js` — which is exactly why `/sw.js` is served with
`cache-control: no-cache`.

Once the incident is over, restore the real `public/sw.js`.
