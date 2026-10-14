const args = new Set(process.argv.slice(2));
const wantsWhatsApp = args.has("--whatsapp") || args.has("--ai");
const wantsAI = args.has("--ai");
const wantsBootstrap = args.has("--bootstrap");

const required = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  ...(wantsBootstrap ? ["PLATFORM_BOOTSTRAP_SECRET"] : []),
  ...(wantsWhatsApp
    ? [
        "META_APP_ID",
        "META_APP_SECRET",
        "META_EMBEDDED_SIGNUP_CONFIG_ID",
        "META_TOKEN_ENCRYPTION_KEY",
        "META_WEBHOOK_VERIFY_TOKEN",
      ]
    : []),
  ...(wantsAI ? ["OPENAI_API_KEY"] : []),
];

const missing = required.filter((name) => !(process.env[name] ?? "").trim());
const problems: string[] = [];

if (process.env["VITE_SUPABASE_URL"] && process.env["SUPABASE_URL"]) {
  const publicUrl = process.env["VITE_SUPABASE_URL"]!.replace(/\/+$/, "");
  const serverUrl = process.env["SUPABASE_URL"]!.replace(/\/+$/, "");
  if (publicUrl !== serverUrl) problems.push("VITE_SUPABASE_URL and SUPABASE_URL point to different projects.");
}
if (process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] && process.env["SUPABASE_PUBLISHABLE_KEY"]) {
  if (process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] !== process.env["SUPABASE_PUBLISHABLE_KEY"]) {
    problems.push("The client and server publishable keys do not match.");
  }
}
if (process.env["META_GRAPH_API_VERSION"] && !/^v\d+\.\d+$/.test(process.env["META_GRAPH_API_VERSION"]!)) {
  problems.push("META_GRAPH_API_VERSION must look like v25.0.");
}
if (wantsWhatsApp && process.env["META_TOKEN_ENCRYPTION_KEY"]) {
  try {
    const keyBytes = atob(process.env["META_TOKEN_ENCRYPTION_KEY"]!).length;
    if (keyBytes !== 32) problems.push("META_TOKEN_ENCRYPTION_KEY must be base64-encoded 32-byte key material.");
  } catch {
    problems.push("META_TOKEN_ENCRYPTION_KEY must be valid base64.");
  }
}

const forbiddenClientSecrets = [
  "VITE_SUPABASE_SERVICE_ROLE_KEY",
  "VITE_PLATFORM_BOOTSTRAP_SECRET",
  "VITE_META_APP_SECRET",
  "VITE_META_TOKEN_ENCRYPTION_KEY",
  "VITE_META_WEBHOOK_VERIFY_TOKEN",
  "VITE_OPENAI_API_KEY",
];
for (const name of forbiddenClientSecrets) {
  if ((process.env[name] ?? "").trim()) problems.push(name + " must never be exposed to the browser.");
}

if (missing.length || problems.length) {
  if (missing.length) {
    console.error("Missing required environment variable names: " + missing.join(", "));
  }
  for (const problem of problems) console.error("Configuration error: " + problem);
  console.error("Values are never printed. Copy .env.example and fill secrets only in local/private hosting settings.");
  console.error("Optional flags: --bootstrap, --whatsapp, --ai (includes WhatsApp checks).");
  process.exitCode = 1;
} else {
  console.log("Environment preflight passed. Secret values were not printed.");
}
