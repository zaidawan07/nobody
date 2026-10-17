# Deploy

How a build becomes the live app, and how to operate it once it is up.

Scope: this file covers the build output, its HTTP headers, and the service
worker. Outstanding work that has to happen before launch lives in
`docs/PRELAUNCH.md`.

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
