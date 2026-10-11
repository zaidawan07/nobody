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
    plugins.push(nitro({ preset: nitroPreset }));
  }

  return { plugins };
});
