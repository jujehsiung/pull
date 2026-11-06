/** Intake form vocabulary shared by the public form (client) and the server action. */

export const PICKUP_WINDOWS = ["09:00–12:00", "12:00–15:00", "15:00–18:00"] as const
export type PickupWindow = (typeof PICKUP_WINDOWS)[number]

export const PICKUP_WINDOW_LABELS: Record<string, string> = {
  "09:00–12:00": "Morning — 09:00 to 12:00",
  "12:00–15:00": "Afternoon — 12:00 to 15:00",
  "15:00–18:00": "End of day — 15:00 to 18:00",
}

/** Shippo markets the demo covers; the contact's country is added if it is outside this list. */
export const COUNTRY_OPTIONS = [
  "US",
  "CA",
  "GB",
  "FR",
  "IT",
  "DE",
  "ES",
  "NL",
  "BE",
  "DK",
  "SE",
  "JP",
  "KR",
  "CN",
  "AE",
  "AU",
] as const
