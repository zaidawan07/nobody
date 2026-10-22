// Captures the original Error out-of-band so server.ts can recover the stack
// when h3 has already swallowed the throw into a generic 500 Response.

let lastCapturedError: { error: unknown; at: number } | undefined;
const TTL_MS = 5_000;

function record(error: unknown) {
  lastCapturedError = { error, at: Date.now() };
}

// Error messages and causes can contain customer input, provider responses, or
// credentials. Keep only the error class, numeric HTTP status, and stack frames.
const DESCRIPTION_LENGTH_LIMIT = 4_000;
const SAFE_ERROR_NAMES = new Set([
  "Error",
  "TypeError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "URIError",
  "AggregateError",
  "AbortError",
  "HTTPError",
]);

export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return "NonError thrown (details omitted)";

  const name = safeErrorName(error);
  const status = describeStatus(error);
  const frames = safeStackLocations(error);

  return [`${name}${status}`, frames].filter(Boolean).join("\n").slice(0, DESCRIPTION_LENGTH_LIMIT);
}

function safeErrorName(error: Error): string {
  try {
    return SAFE_ERROR_NAMES.has(error.name) ? error.name : "Error";
  } catch {
    return "Error";
  }
}

function safeStackLocations(error: Error): string | undefined {
  let stack: unknown;
  try {
    stack = error.stack;
  } catch {
    return undefined;
  }
  if (typeof stack !== "string") return undefined;

  const locations: string[] = [];
  for (const line of stack.split("\n").slice(1)) {
    // Never log frame text or paths. They can contain query strings or data
    // when a provider or runtime constructs a nonstandard stack trace.
    const match = /:(\d{1,8}):(\d{1,8})\)?\s*$/.exec(line);
    if (match) locations.push(`  frame ${locations.length + 1} at ${match[1]}:${match[2]}`);
    if (locations.length === 20) break;
  }
  return locations.join("\n") || undefined;
}

function describeStatus(error: Error): string {
  try {
    const { status, statusCode } = error as { status?: unknown; statusCode?: unknown };
    const value = status ?? statusCode;
    return typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599
      ? ` (status ${value})`
      : "";
  } catch {
    return "";
  }
}

function isErrorLike(value: unknown): value is Error {
  return value instanceof Error;
}

export function describeConsoleErrorArgument(value: unknown): string {
  if (isErrorLike(value)) return describeError(value);
  return typeof value === "string" ? "[error log text omitted]" : "[error log value omitted]";
}

// Wrap console.error so errors logged by any layer — including h3's internal
// unhandled-error logging, which this file cannot hook directly — are both
// recorded for consumeLastCapturedError and reduced to safe diagnostic metadata.
const originalConsoleError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  const safeArgs = args.map((arg) => {
    if (isErrorLike(arg)) {
      record(arg);
    }
    return describeConsoleErrorArgument(arg);
  });
  originalConsoleError(...safeArgs);
};

if (typeof globalThis.addEventListener === "function") {
  globalThis.addEventListener("error", (event) => record((event as ErrorEvent).error ?? event));
  globalThis.addEventListener("unhandledrejection", (event) =>
    record((event as PromiseRejectionEvent).reason),
  );
}

export function consumeLastCapturedError(): unknown {
  if (!lastCapturedError) return undefined;
  if (Date.now() - lastCapturedError.at > TTL_MS) {
    lastCapturedError = undefined;
    return undefined;
  }
  const { error } = lastCapturedError;
  lastCapturedError = undefined;
  return error;
}
