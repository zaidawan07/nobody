import { createFileRoute } from "@tanstack/react-router";

/**
 * A deliberately small target check for the staging smoke script. It exposes
 * no credentials, database data, or deployment metadata beyond the project
 * reference already present in the browser's public Supabase URL.
 */
export const Route = createFileRoute("/api/staging/identity")({
  server: {
    handlers: {
      GET: () => {
        const projectRef = process.env["SUPABASE_URL"]?.match(
          /^https:\/\/([a-z0-9-]+)\.supabase\.co\/?$/i,
        )?.[1];
        if (process.env["ESTATEOS_DEPLOYMENT_ENV"] !== "staging" || !projectRef) {
          return Response.json(
            { ok: false },
            { status: 404, headers: { "cache-control": "no-store" } },
          );
        }
        return Response.json(
          { environment: "staging", supabaseProjectRef: projectRef },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
