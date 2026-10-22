// EstateOS service worker.
//
// Static assets only. This file is allowed to cache same-origin GET responses
// for build output and brand files; it deliberately never touches HTML (every
// route is tenant-scoped and permission-aware), /api/*, or TanStack Start
// server functions. Caching any of those would pin one agency's data in a
// shared cache and serve it to the next session that opens the app.
//
// Updates reach users through two mechanisms, because either one alone can be
// missed:
//
//   1. CACHE_VERSION is bumped per release (see docs/DEPLOY.md). On activate
//      the worker deletes every cache that is not its own, so a bump starts
//      from a clean slate and nothing from an older release survives.
//   2. Files whose URL does not change between releases -- manifest, icons,
//      favicon, robots.txt -- are revalidated on every use, so they stay fresh
//      even when nobody bumps the version. /assets/* files are content-hashed
//      by the build, so a release changes their URL and the stale entry simply
//      stops being requested.
//
// The worker is registered in production builds only
// (src/components/pwa/useServiceWorker.ts). There is no install-time precache
// on purpose: a single missing file would fail the whole install, so
// everything is cached on first use instead.

const CACHE_VERSION = "v1";
const CACHE_NAME = `estateos-static-${CACHE_VERSION}`;

// Content-hashed by the build: two releases can never use the same URL.
const HASHED_PREFIX = "/assets/";

// Not hashed: the URL survives a release, so a cached copy must be revalidated.
const REVALIDATED_FILES = ["/manifest.webmanifest", "/favicon.ico", "/robots.txt"];
const REVALIDATED_PREFIXES = ["/icons/"];

// Backstop for a forgotten CACHE_VERSION bump: the cache stops growing at this
// many entries, oldest first, so a visit's own freshly fetched files are the
// last to go and only leftovers from older releases get dropped. The cost of
// dropping something still needed is one re-download, never a broken page.
const MAX_ENTRIES = 250;

function classify(request, pathname) {
  if (request.method !== "GET") return null;
  if (new URL(request.url).origin !== self.location.origin) return null;
  if (pathname.startsWith(HASHED_PREFIX)) return "hashed";
  if (
    REVALIDATED_FILES.includes(pathname) ||
    REVALIDATED_PREFIXES.some((p) => pathname.startsWith(p))
  ) {
    return "revalidate";
  }
  return null;
}

async function enforceLimit(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_ENTRIES) return;
  const excess = keys.slice(0, keys.length - MAX_ENTRIES);
  await Promise.all(excess.map((key) => cache.delete(key)));
}

// Content-hashed asset: the cache copy is by definition the right one.
async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    await enforceLimit(cache);
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const kind = classify(request, new URL(request.url).pathname);

  if (kind === "hashed") {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (kind === "revalidate") {
    // One fetch shared by both paths below, kept alive by waitUntil so the
    // background refresh is not abandoned the moment the page gets its cached
    // copy back. First use has no cached copy, so it awaits the same fetch.
    const refresh = (async () => {
      const cache = await caches.open(CACHE_NAME);
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    })();
    const settled = refresh.catch(() => undefined);
    event.waitUntil(settled);

    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await settled;
        // Nothing cached and the network failed: a plain network error, exactly
        // as if no worker were installed.
        return response ?? Response.error();
      })(),
    );
  }
});

self.addEventListener("activate", (event) => {
  // No skipWaiting() on purpose: a new worker takes over on the next full
  // restart, once the tabs running the old release are closed. Taking over
  // mid-session would delete the cache entries that page still needs.
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)),
      );
    })(),
  );
});
