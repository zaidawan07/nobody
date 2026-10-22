/**
 * The single source of truth for property availability and status transitions.
 *
 * Every place that decides whether inventory is recommendable -- server search,
 * availability checks, dashboard counts, UI filters -- must use this module
 * rather than re-deriving the rule from a literal like `status === "available"`.
 * That is how the UI and the database drifted apart in the first place.
 *
 * The vocabulary is the existing `property_status` enum and is deliberately not
 * extended here. Nothing in this file invents a status.
 */

/** The only status that means "currently available to a customer". */
export const AVAILABLE_STATUS = "available" as const;

/**
 * Every status that does NOT count as available. Draft is not available because
 * it is unfinished; the rest are terminal or off-market states.
 */
export const UNAVAILABLE_STATUSES = [
  "draft",
  "reserved",
  "sold",
  "rented",
  "unavailable",
  "expired",
  "inactive",
] as const;

export type UnavailableStatus = (typeof UNAVAILABLE_STATUSES)[number];

export type PropertyStatus = "available" | UnavailableStatus;

/**
 * Statuses that mean the listing has completed a transaction or been taken
 * definitively off the market. Reaching one of these from `available` is
 * normal; leaving one back to `available` is not something a routine edit or
 * status picker may do, because that is exactly how a sold property reappears
 * as a live listing.
 */
export const TERMINAL_STATUSES = ["sold", "rented"] as const;

export function isTerminalStatus(status: string): status is (typeof TERMINAL_STATUSES)[number] {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
}

/** The canonical rule: only `available` is recommendable. */
export function isAvailableStatus(status: string): boolean {
  return status === AVAILABLE_STATUS;
}

/** True when a property with this status must not be offered to a customer. */
export function isHiddenStatus(status: string): boolean {
  return !isAvailableStatus(status) || !status;
}

/**
 * Whether moving `from` -> `to` is a transition an ordinary status change may
 * make. Deliberately conservative: any question returns a rejection, so a new
 * status added to the enum later cannot silently become a free path.
 */
export function isAllowedTransition(from: string, to: string): boolean {
  if (from === to) return true;
  // The guarded direction: leaving a closed/off-market state to look live.
  if (isTerminalStatus(from) && isAvailableStatus(to)) return false;
  if (isTerminalStatus(from) && to === "reserved") return false;
  return true;
}

export function transitionError(from: string, to: string): string | null {
  if (isAllowedTransition(from, to)) return null;
  return (
    `A ${from} property can't go back to ${to} directly. ` +
    `If that was a mistake, reopen it first: reopening is recorded.`
  );
}
