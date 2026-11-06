/** Timestamp formatting shared by the locked board banner and the review summary. */

const SUBMITTED_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/New_York",
  timeZoneName: "short",
})

/** `6 Nov 2026, 03:42 PM EST` → uppercase, matching the mono eyebrows. */
export function formatSubmittedAt(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return SUBMITTED_FORMAT.format(date).toUpperCase()
}
