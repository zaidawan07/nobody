/**
 * Whether installation has to be explained the Apple way.
 *
 * iOS Safari has no `beforeinstallprompt` and no install dialog that can be
 * triggered programmatically, so the only honest thing to show there is where
 * the menu item lives (Share → Add to Home Screen).
 *
 * This predicate lives on its own so both UA cases can be exercised directly:
 * iPadOS 13 and later report themselves as a desktop Macintosh and are only
 * distinguishable by their touch support.
 */
export function isAppleMobile(userAgent: string, maxTouchPoints: number): boolean {
  if (/iP(hone|ad|od)/.test(userAgent)) return true;
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1;
}
