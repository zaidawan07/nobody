import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, relative, resolve, sep } from "node:path";

const root = process.cwd();
const ignoredDirectories = new Set([
  ".git", "node_modules", ".output", ".wrangler", "dist", "coverage", ".tanstack",
]);
const allowedExtensions = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".yaml", ".yml",
  ".toml", ".sql", ".md", ".txt", ".env", ".example", ".lock", ".css", ".html",
]);

const detectors: Array<{ label: string; pattern: RegExp }> = [
  { label: "Supabase secret key", pattern: /sb_secret_[A-Za-z0-9_-]{20,}/ },
  { label: "OpenAI API key", pattern: /sk-(?:proj-)?[A-Za-z0-9_-]{24,}/ },
  { label: "Meta access token", pattern: /EAAG[A-Za-z0-9]{24,}/ },
  { label: "AWS access key", pattern: /AKIA[0-9A-Z]{16}/ },
  { label: "credential-bearing database URL", pattern: /postgres(?:ql)?:\/\/[^\s"'\x60]+:[^\s"'\x60@]+@[^\s"'\x60]+/i },
  {
    label: "non-empty server-secret assignment",
    pattern: /(?:SUPABASE_SERVICE_ROLE_KEY|PLATFORM_BOOTSTRAP_SECRET|META_APP_SECRET|META_TOKEN_ENCRYPTION_KEY|META_WEBHOOK_VERIFY_TOKEN|OPENAI_API_KEY)[ \t]*=[ \t]*["']?((?!process\.env|Deno\.env|import\.meta\.env)[^\s"'#]{12,})/m,
  },
];

const files: string[] = [];
function walk(directory: string) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) walk(resolve(directory, entry.name));
      continue;
    }
    const path = resolve(directory, entry.name);
    if (entry.name === "bun.lock" || entry.name === "bun.lockb") continue;
    if (allowedExtensions.has(extname(entry.name)) || entry.name === ".env.example" || entry.name === "env") {
      try {
        if (statSync(path).size <= 2_000_000) files.push(path);
      } catch {
        // Ignore files that disappear while the scan is running.
      }
    }
  }
}

walk(root);
const findings: Array<{ file: string; label: string }> = [];
for (const file of files) {
  let content: string;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  for (const detector of detectors) {
    if (detector.pattern.test(content)) {
      findings.push({ file: relative(root, file).split(sep).join("/"), label: detector.label });
    }
  }
}

if (findings.length > 0) {
  console.error("Potential credentials found in the current working tree:");
  for (const finding of findings) console.error(`- ${finding.file}: ${finding.label}`);
  console.error("Move credentials to a secret manager and rotate any credential that was committed.");
  process.exitCode = 1;
} else {
  console.log(`Secret hygiene check passed (${files.length} text files scanned; Git history is not scanned).`);
}
