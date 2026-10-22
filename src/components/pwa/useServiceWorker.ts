import { useEffect } from "react";

/**
 * Installs public/sw.js — production builds only.
 *
 * Dev mode never registers a worker, because a leftover registration from a
 * preview build would keep serving stale assets over the dev server; to make
 * that impossible this hook actively unregisters whatever is there instead.
 * Failures are logged and swallowed: a service worker is an enhancement, and
 * losing one must never take the app down with it.
 */
export function useServiceWorker(): void {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (!import.meta.env.PROD) {
      void removeLeftovers();
      return;
    }

    // Registration needs a secure context. Over plain HTTP (anything that is
    // not localhost) it rejects, so skip rather than log a scary error.
    if (!window.isSecureContext) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        console.warn("[pwa] service worker registration failed");
      });
    };

    if (document.readyState === "complete") {
      register();
      return;
    }
    // Wait for `load`: registering earlier competes with the app's own assets
    // for the network while the first paint is still coming in.
    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);
}

/** Unregisters this app's worker and drops its caches (dev mode only). */
async function removeLeftovers(): Promise<void> {
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    const ours = registrations.filter((registration) =>
      [registration.active, registration.installing, registration.waiting].some(
        (worker) => worker?.scriptURL.endsWith("/sw.js") ?? false,
      ),
    );
    await Promise.all(ours.map((registration) => registration.unregister()));

    const names = await caches.keys();
    await Promise.all(
      names.filter((name) => name.startsWith("estateos-")).map((name) => caches.delete(name)),
    );
  } catch {
    // Cache Storage can be unavailable (private browsing). Dev still works --
    // it just runs against whatever the browser already had.
  }
}
