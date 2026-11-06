/**
 * Read + authorisation side of the public showroom intake (Act 3, FR-17/18).
 *
 * The intake URL is a bearer credential scoped to one request and expiring in 14 days (PRD §13).
 * Every page load and every server action goes through `authorizeIntakeToken`, which re-verifies:
 *
 *   1. the HMAC signature and scope ("intake");
 *   2. the request row still exists and the token id is that request;
 *   3. the presented token's sha256 is the hash stored on the request (when the stylist set one) —
 *      so clearing/re-minting `requests.intake_token_hash` revokes the link without rotating
 *      LINK_SECRET;
 *   4. the request's job, contact and stylist are loaded in the same call, and a DB failure returns
 *      null (never a partial page).
 *
 * It also owns the pure bits the page and action share: address conversion for Shippo, the
 * cheapest/fastest selection of rates, and the form's sensible defaults from the contact card.
 */
import { eq } from "drizzle-orm"
import { db } from "@/db/client"
import { contacts, jobs, requests, shipments, users } from "@/db/schema"
import type { Address, ShippoRate } from "@/lib/shippo"
import { verifyLink } from "@/lib/auth"
import { tokenHashMatches } from "@/app/b/[token]/token"
import { PICKUP_WINDOWS } from "@/components/intake/constants"

export type RequestRow = typeof requests.$inferSelect
export type JobRow = typeof jobs.$inferSelect
export type ContactRow = typeof contacts.$inferSelect
export type ShipmentRow = typeof shipments.$inferSelect
export type UserRow = typeof users.$inferSelect

export interface IntakeContext {
  request: RequestRow
  job: JobRow
  contact: ContactRow | null
  stylist: UserRow | null
  shipment: ShipmentRow | null
}

/** A stored intake, typed for the page: the DB jsonb is deliberately loose. */
export interface StoredIntake {
  length: number
  width: number
  height: number
  weightKg: number
  pickup: Record<string, string>
}

export async function authorizeIntakeToken(rawToken: string): Promise<IntakeContext | null> {
  if (!rawToken) return null
  const link = verifyLink(rawToken)
  if (!link || link.scope !== "intake") return null

  try {
    const database = db()
    const [request] = await database.select().from(requests).where(eq(requests.id, link.id)).limit(1)
    if (!request) return null
    // A stored hash pins the exact link that was minted; a missing hash means one was not recorded.
    if (request.intakeTokenHash && !tokenHashMatches(rawToken, request.intakeTokenHash)) return null

    const [job] = await database.select().from(jobs).where(eq(jobs.id, request.jobId)).limit(1)
    if (!job) return null

    const [contact] = request.contactId
      ? await database.select().from(contacts).where(eq(contacts.id, request.contactId)).limit(1)
      : [null]
    const [stylist] = await database.select().from(users).where(eq(users.id, job.userId)).limit(1)
    const [shipment] = await database
      .select()
      .from(shipments)
      .where(eq(shipments.requestId, request.id))
      .limit(1)

    return {
      request,
      job,
      contact: contact ?? null,
      stylist: stylist ?? null,
      shipment: shipment ?? null,
    }
  } catch (error) {
    console.error("[intake] authorisation failed", error)
    return null
  }
}

export interface IntakeDefaults {
  name: string
  phone: string
  email: string
  street1: string
  street2: string
  city: string
  state: string
  zip: string
  country: string
  pickupDate: string
  pickupWindow: string
  length: number
  width: number
  height: number
  weightKg: number
}

function pick(source: Record<string, string> | null | undefined, ...keys: string[]): string {
  if (!source) return ""
  for (const key of keys) {
    const value = source[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return ""
}

/** ISO date `days` from now (UTC, which is fine for a "tomorrow or later" pickup guard). */
export function isoDatePlusDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)
}

/**
 * Prefill the form: the previous intake if the showroom already submitted one, otherwise the
 * contact card's showroom address and first email. Parcel fields keep the previous submission too.
 */
export function intakeDefaults(contact: ContactRow | null, shipment: ShipmentRow | null): IntakeDefaults {
  const stored = (shipment?.intake?.pickup ?? null) as Record<string, string> | null
  const address = (contact?.showroomAddress ?? null) as Record<string, string> | null
  const country = (stored?.country ?? address?.country ?? contact?.prMarket ?? "US").trim().toUpperCase()

  return {
    name: pick(stored, "name") || pick(address, "name"),
    phone: pick(stored, "phone") || pick(address, "phone"),
    email: pick(stored, "email") || contact?.emails?.[0]?.trim() || "",
    street1: pick(stored, "street1") || pick(address, "street1", "street", "address"),
    street2: pick(stored, "street2") || pick(address, "street2"),
    city: pick(stored, "city") || pick(address, "city"),
    state: pick(stored, "state") || pick(address, "state", "province"),
    zip: pick(stored, "zip") || pick(address, "zip", "postal_code", "postcode"),
    country: country.slice(0, 2) || "US",
    pickupDate: pick(stored, "date") || isoDatePlusDays(1),
    pickupWindow: pick(stored, "window") || PICKUP_WINDOWS[0],
    length: shipment?.intake?.length ?? 40,
    width: shipment?.intake?.width ?? 30,
    height: shipment?.intake?.height ?? 12,
    weightKg: shipment?.intake?.weightKg ?? 1.2,
  }
}

/** `12 Rue de la Paix, Paris, 75002, FR` — for display next to the form. */
export function formatAddress(address: Record<string, string> | null | undefined): string {
  if (!address) return ""
  return ["name", "street1", "street2", "city", "state", "zip", "country"]
    .map((key) => (address[key] ?? "").trim())
    .filter(Boolean)
    .join(", ")
}

export interface StudioDestination {
  address: Address | null
  missing: string[]
  display: string
}

/**
 * `users.studio_address` is free-form jsonb. Convert it to the Address Shippo needs, and if a
 * required field is missing say which — a half-built address gets a confusing 400 from Shippo.
 */
export function studioAddressToShippo(
  studioAddress: Record<string, string> | null | undefined,
): StudioDestination {
  const address = studioAddress ?? {}
  const street1 = [pick(address, "street1", "street", "address"), pick(address, "street2")]
    .filter(Boolean)
    .join(", ")
  const city = pick(address, "city")
  const zip = pick(address, "zip", "postal_code", "postcode")
  const country = pick(address, "country").toUpperCase().slice(0, 2)
  const missing: string[] = []
  if (!street1) missing.push("street1")
  if (!city) missing.push("city")
  if (!zip) missing.push("zip")
  if (!country) missing.push("country")

  if (missing.length > 0) {
    return { address: null, missing, display: formatAddress(address) }
  }

  return {
    address: {
      name: pick(address, "name") || "PULL studio",
      street1,
      city,
      state: pick(address, "state", "province") || undefined,
      zip,
      country,
      phone: pick(address, "phone") || undefined,
      email: pick(address, "email") || undefined,
    },
    missing,
    display: formatAddress(address),
  }
}

export interface IntakeRateOption extends ShippoRate {
  tags: ("cheapest" | "fastest")[]
}

/**
 * Present at most three options — the PRD's "cheapest, fastest, a middle" — while the full rate
 * list stays on the shipment for the label-purchase step. Tags are computed against all rates, not
 * just the three shown, so "cheapest" always means cheapest.
 */
export function presentRates(rates: ShippoRate[] | null | undefined, limit = 3): IntakeRateOption[] {
  const all = (rates ?? []).filter((rate) => Number.isFinite(rate.amount))
  if (all.length === 0) return []

  const byPrice = [...all].sort((a, b) => a.amount - b.amount || a.days - b.days)
  const bySpeed = [...all].sort((a, b) => a.days - b.days || a.amount - b.amount)
  const cheapest = byPrice[0]
  const fastest = bySpeed[0]
  const middle = byPrice[Math.floor((byPrice.length - 1) / 2)]

  const chosen: ShippoRate[] = []
  for (const rate of [cheapest, fastest, middle, ...byPrice]) {
    if (!rate) continue
    if (chosen.some((entry) => entry.id === rate.id)) continue
    chosen.push(rate)
    if (chosen.length === limit) break
  }
  // Read in price order unless the fast one would be buried; cheapest first is the one the showroom
  // and the stylist both care about.
  chosen.sort((a, b) => a.amount - b.amount)

  return chosen.map((rate) => {
    const tags: ("cheapest" | "fastest")[] = []
    if (rate.id === cheapest.id) tags.push("cheapest")
    if (rate.id === fastest.id) tags.push("fastest")
    return { ...rate, tags }
  })
}

/** `40 × 30 × 12 cm · 1.2 kg` */
export function parcelSummary(intake: {
  length: number
  width: number
  height: number
  weightKg: number
} | null | undefined): string {
  if (!intake) return ""
  return `${intake.length} × ${intake.width} × ${intake.height} cm · ${intake.weightKg} kg`
}
