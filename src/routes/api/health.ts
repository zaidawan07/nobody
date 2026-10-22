// Liveness probe for smoke tests and post-deploy checks: is the server up and
// serving routes? That is the only question it answers, on purpose.
//
// It deliberately does NOT touch the database. The app reaches Supabase over
// HTTPS with its API keys and never opens a direct Postgres connection (that is
// DATABASE_URL, which only the local migration script reads), so a database
// check here would have to invent a connection the app does not use -- and an
// unauthenticated endpoint that runs a query on every request is a free way for
// anyone to hammer the database. If Supabase is unreachable, page loads fail;
// that is what real monitoring watches.
//
// The response confirms that the app is up and nothing else: no environment
// names, no versions, no build identifiers. An unauthenticated endpoint should
// not describe the deployment to whoever asks.
import { createFileRoute } from "@tanstack/react-router";

// Module scope, so this is "how long this Worker isolate has been alive", not
// how long the app has been deployed. Isolates are recycled freely, so treat it
// as a hint rather than a deploy timestamp.
const startedAt = Date.now();

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: () =>
        Response.json(
          {
            ok: true,
            status: "ok",
            service: "estateos",
            time: new Date().toISOString(),
            uptime_s: Math.round((Date.now() - startedAt) / 1000),
          },
          { headers: { "cache-control": "no-store" } },
        ),
    },
  },
});
