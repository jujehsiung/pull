/**
 * Job date rules, shared by the server action and the browser form so the inline error the stylist
 * sees while typing is the same rule the database write enforces (FR-1).
 *
 * PRD §8: call_in_date <= shoot_date <= return_date.
 */
export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && ISO_DATE.test(value) && !Number.isNaN(Date.parse(value))
}

export function validateJobDates(callIn: string, shoot: string, ret: string): string | null {
  if (!isIsoDate(callIn) || !isIsoDate(shoot) || !isIsoDate(ret)) return "All three dates are required."
  if (callIn > shoot) return "Call-in date cannot be after the shoot date."
  if (shoot > ret) return "Shoot date cannot be after the return date."
  return null
}
