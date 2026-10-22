import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";

// Property Desk's build config, written directly against Vite. Five plugins:
//
//   tailwindcss()        - Tailwind v4 (no PostCSS plugin, no tailwind.config)
//   tsConfigPaths()      - resolves the "@/*" alias from tsconfig.json
//   tanstackStart()      - file-based routing, SSR, server functions
//   react()              - React Refresh for dev mode (after tanstackStart)
//   nitro()              - the deployable server output, build only
//
// NITRO_PRESET switches the deploy target without touching this file.
//   cloudflare-module  (default) Cloudflare Workers, writes .output/
//   node-server                  any Node host, writes .output/
//   vercel / netlify / railway    those platforms' adapters
const nitroPreset = process.env["NITRO_PRESET"] ?? "cloudflare-module";
// OneDrive can hold a reparse-point lock on the default `.output` directory.
// Keep `.output` as the deploy default, but allow a temporary output path for
// local builds without asking the sync client to remove its tracked directory.
const nitroOutputDir = process.env["ESTATEOS_NITRO_OUTPUT_DIR"];

export default defineConfig(async ({ command }) => {
  const plugins = [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({
      // Use src/server.ts (the SSR error wrapper) as the server entry instead
      // of TanStack Start's bundled one. Nitro builds from the same file.
      server: { entry: "server" },
      // Hard-stop a client bundle that imports a *.server.ts module. This is
      // the guard that keeps the service-role Supabase client out of the
      // browser; without it a stray import ships the secret to every client.
      importProtection: {
        behavior: "error",
        client: {
          files: ["**/server/**"],
          specifiers: ["server-only"],
        },
      },
    }),
    // React Refresh runtime. Must come AFTER tanstackStart() -- TanStack
    // Start's documented plugin order. Without it dev mode fails on every
    // page with "/@react-refresh could not be resolved". (The Lovable wrapper
    // used to bundle this plugin; our replacement omitted it, and tsc + build
    // + tests don't exercise dev mode so nothing caught it.)
    react(),
  ];

  if (command === "build") {
    const { nitro } = await import("nitro/vite");
    plugins.push(
      nitro({
        preset: nitroPreset,
        // Workers Builds runs `wrangler preview` for this non-production
        // branch. Wrangler requires an explicit previews config on the
        // generated Nitro Worker config before it can create a Preview.
        cloudflare: { wrangler: { previews: {} } },
        // Pin the Worker compatibility date to a date Cloudflare already
        // supports. Nitro's default "latest" can resolve to tomorrow in UTC
        // and make the generated Worker impossible to preview/deploy today.
        compatibilityDate: { default: "2026-10-19", cloudflare: "2026-10-19" },
        ...(nitroOutputDir
          ? {
              output: {
                dir: nitroOutputDir,
                serverDir: `${nitroOutputDir}/server`,
                publicDir: `${nitroOutputDir}/public`,
              },
            }
          : {}),
        // Nitro writes these into .output/public/_headers, which Cloudflare
        // Workers applies to responses served by the static-assets binding.
        // /assets/* is content-hashed and safe to hold for a year; /sw.js is
        // the opposite -- it is how a service-worker update reaches users, so
        // a host or CDN that caches it delays that update for as long as it
        // cached it for.
        routeRules: {
          "/sw.js": { headers: { "cache-control": "no-cache, no-store, must-revalidate" } },
        },
      }),
    );
  }

  return { plugins };
});
