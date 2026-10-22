const BASE_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "DATABASE_URL",
];

const META_KEYS = [
  "META_APP_ID",
  "META_APP_SECRET",
  "META_EMBEDDED_SIGNUP_CONFIG_ID",
  "META_GRAPH_API_VERSION",
  "META_WEBHOOK_VERIFY_TOKEN",
  "WHATSAPP_TOKEN_ENCRYPTION_KEY",
];

const AI_KEYS = ["OPENAI_API_KEY", "OPENAI_MODEL"];

export function parseEnv(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function configured(env, key) {
  return typeof env[key] === "string" && env[key].trim().length > 0;
}

function missingKeys(env, keys) {
  return keys.filter((key) => !configured(env, key));
}

function supabaseRefFromUrl(value) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    const match = /^([a-z0-9]+)\.supabase\.co$/.exec(host);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function supabaseRefFromDatabaseUrl(value) {
  try {
    const url = new URL(value);
    const direct = /^db\.([a-z0-9]+)\.supabase\.co$/i.exec(url.hostname);
    if (direct) return direct[1].toLowerCase();
    const pooled = /^postgres\.([a-z0-9]+)$/i.exec(decodeURIComponent(url.username));
    if (pooled && url.hostname.toLowerCase().endsWith(".pooler.supabase.com")) {
      return pooled[1].toLowerCase();
    }
  } catch {
    return null;
  }
  return null;
}

function isValidPostgresUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "postgres:" || url.protocol === "postgresql:";
  } catch {
    return false;
  }
}

export function assessPilotEnv(env) {
  const missingBase = missingKeys(env, BASE_KEYS);
  const errors = [];
  const warnings = [];

  if (configured(env, "DATABASE_URL") && !isValidPostgresUrl(env.DATABASE_URL)) {
    errors.push("DATABASE_URL must be a PostgreSQL URL.");
  }

  const refs = [
    supabaseRefFromUrl(env.SUPABASE_URL ?? ""),
    supabaseRefFromUrl(env.VITE_SUPABASE_URL ?? ""),
    supabaseRefFromDatabaseUrl(env.DATABASE_URL ?? ""),
  ].filter(Boolean);
  if (new Set(refs).size > 1) {
    errors.push("Supabase URL and database URL project references do not match.");
  }
  if (
    configured(env, "SUPABASE_URL") &&
    configured(env, "VITE_SUPABASE_URL") &&
    (!supabaseRefFromUrl(env.SUPABASE_URL) || !supabaseRefFromUrl(env.VITE_SUPABASE_URL))
  ) {
    errors.push("Could not safely verify the Supabase project reference from both project URLs.");
  }

  const liveSendEnabled =
    String(env.WHATSAPP_LIVE_SEND ?? "false")
      .trim()
      .toLowerCase() === "true";
  const checkinSendEnabled =
    String(env.MESSAGING_LIVE_SEND ?? "false")
      .trim()
      .toLowerCase() === "true";
  if (liveSendEnabled) {
    errors.push("WHATSAPP_LIVE_SEND is enabled; keep it false until the real pilot gates pass.");
  }
  if (checkinSendEnabled) {
    errors.push("MESSAGING_LIVE_SEND is enabled; keep it false until the real pilot gates pass.");
  }

  if (configured(env, "WHATSAPP_TOKEN_ENCRYPTION_KEY")) {
    const key = env.WHATSAPP_TOKEN_ENCRYPTION_KEY.trim();
    let byteLength = 0;
    try {
      byteLength = Buffer.from(key, "base64").length;
    } catch {
      byteLength = 0;
    }
    if (byteLength !== 32 || !/^[A-Za-z0-9+/]+={0,2}$/.test(key)) {
      errors.push("WHATSAPP_TOKEN_ENCRYPTION_KEY must be base64 encoding of exactly 32 bytes.");
    }
  }

  if (configured(env, "CRON_SECRET") && env.CRON_SECRET.trim().length < 32) {
    errors.push("CRON_SECRET must contain at least 32 characters.");
  }

  const metaMissing = missingKeys(env, META_KEYS);
  const aiMissing = missingKeys(env, AI_KEYS);
  const cronMissing = missingKeys(env, ["CRON_SECRET"]);
  const emailConfigured = configured(env, "SMTP_HOST") || configured(env, "RESEND_API_KEY");

  if (missingBase.length) warnings.push("Base app/database configuration is incomplete.");

  return {
    baseReady: missingBase.length === 0 && !errors.some((e) => /DATABASE_URL|Supabase URL/.test(e)),
    missingBase,
    errors,
    warnings,
    meta: { ready: metaMissing.length === 0, missing: metaMissing },
    ai: { ready: aiMissing.length === 0, missing: aiMissing },
    cron: { ready: cronMissing.length === 0, missing: cronMissing },
    email: { ready: emailConfigured },
    liveSendingSafe: !liveSendEnabled && !checkinSendEnabled,
  };
}
