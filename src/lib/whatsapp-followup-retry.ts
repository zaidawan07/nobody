export const MAX_SAFE_FOLLOWUP_ATTEMPTS = 3;

/**
 * A follow-up failure that cannot succeed on retry: the customer opted out, the
 * service window closed, the number is disconnected, or the plan limit is
 * reached. These are marked failed immediately instead of being retried.
 */
export class PermanentFollowupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentFollowupError";
  }
}

/** Return a retry time only while the failure is known to have happened before a provider request. */
export function getSafeFollowupRetryAt(attempt: number, now = Date.now()): Date | null {
  if (
    !Number.isInteger(attempt) ||
    attempt < 1 ||
    attempt >= MAX_SAFE_FOLLOWUP_ATTEMPTS ||
    !Number.isFinite(now)
  ) {
    return null;
  }

  const delayMs = 60_000 * 2 ** (attempt - 1);
  return new Date(now + delayMs);
}
