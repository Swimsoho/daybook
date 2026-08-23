/**
 * Presentation-only date helper for the mobile layout.
 *
 * Anything that decides what a date *means* — due tone, cadence, recurrence —
 * comes from `@/lib/model` (`relDue`, `daysSince`, `nextOccurrence`), the same
 * functions the desktop layout uses, so the two can never disagree.
 */

/** "Fri, 21 Aug" — the date shown top-right in the mobile header */
export function formatHeaderDate(d: Date = new Date()): string {
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}
