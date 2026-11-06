/**
 * Shippo — rates, labels, tracking.
 * Plain fetch, no SDK: fewer dependencies and the payloads are exactly what the PRD quotes.
 * Test keys (shippo_test_…) run the whole flow without spending money. SETUP.md step 5.
 */
import { env } from "./env"

const BASE = "https://api.goshippo.com"

export function shippoConfigured(): boolean {
  return Boolean(env().SHIPPO_API_KEY)
}

export function shippoMode(): "live" | "test" | "off" {
  const key = env().SHIPPO_API_KEY
  if (!key) return "off"
  return key.startsWith("shippo_test_") ? "test" : "live"
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const key = env().SHIPPO_API_KEY
  if (!key) throw new Error("Shippo is not connected — set SHIPPO_API_KEY (SETUP.md step 5)")
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `ShippoToken ${key}`,
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Shippo ${path} → ${res.status}: ${text.slice(0, 300)}`)
  }
  return res.json() as Promise<T>
}

export interface Address {
  name: string
  street1: string
  city: string
  state?: string
  zip: string
  country: string
  phone?: string
  email?: string
}

export interface Parcel {
  length: number
  width: number
  height: number
  weightKg: number
}

export interface ShippoRate {
  id: string
  carrier: string
  service: string
  amount: number
  currency: string
  days: number
}

interface ShippoRateRaw {
  object_id: string
  provider: string
  amount: string
  currency: string
  estimated_days?: number
  servicelevel?: { name?: string; token?: string }
}

/** Create a shipment and return the rates, cheapest first. */
export async function getRates(input: {
  from: Address
  to: Address
  parcel: Parcel
  /** Declared value for cross-border shipments (defaults to USD 150). */
  declaredValue?: number
  declaredCurrency?: string
  customsDescription?: string
}): Promise<{ shipmentId: string; rates: ShippoRate[]; messages: string[] }> {
  const international = input.from.country !== input.to.country
  const parcel = {
    length: String(input.parcel.length),
    width: String(input.parcel.width),
    height: String(input.parcel.height),
    distance_unit: "cm",
    weight: String(input.parcel.weightKg),
    mass_unit: "kg",
  }

  // Cross-border lanes return ZERO rates without a customs declaration — Shippo needs the
  // contents and value before a carrier will quote. Domestic lanes must not send one.
  const customsDeclaration = international
    ? {
        contents_type: "MERCHANDISE",
        non_delivery_option: "RETURN",
        certify: true,
        certify_signer: "Juje Hsiung",
        items: [
          {
            description: input.customsDescription ?? "Fashion samples — on loan, returnable",
            quantity: 1,
            net_weight: String(input.parcel.weightKg),
            mass_unit: "kg",
            value_amount: String(input.declaredValue ?? 150),
            value_currency: input.declaredCurrency ?? "USD",
            origin_country: input.from.country,
          },
        ],
      }
    : undefined

  const body = {
    address_from: input.from,
    address_to: input.to,
    parcels: [parcel],
    ...(customsDeclaration ? { customs_declaration: customsDeclaration } : {}),
    async: false,
  }
  const shipment = await api<{
    object_id: string
    rates: ShippoRateRaw[]
    messages?: { text?: string }[]
  }>("/shipments", {
    method: "POST",
    body: JSON.stringify(body),
  })
  const messages = (shipment.messages ?? []).map((m) => m.text ?? "").filter(Boolean)
  const rates = (shipment.rates ?? [])
    .map((r) => ({
      id: r.object_id,
      carrier: r.provider,
      service: r.servicelevel?.name ?? r.servicelevel?.token ?? "standard",
      amount: Number(r.amount),
      currency: r.currency,
      days: Number(r.estimated_days) || 5,
    }))
    .sort((a, b) => a.amount - b.amount)
  return { shipmentId: shipment.object_id, rates, messages }
}

export interface Label {
  transactionId: string
  labelUrl: string
  tracking: string
  carrier: string
  amount: number
}

/**
 * Buy the label for a chosen rate. Callers must guard against double purchase.
 * Live keys are additionally gated by SHIPPO_ALLOW_PURCHASE — a demo must never spend money
 * because someone clicked twice or clicked through a walkthrough.
 */
export async function buyLabel(rateId: string): Promise<Label> {
  const mode = shippoMode()
  if (mode === "live" && process.env.SHIPPO_ALLOW_PURCHASE !== "true") {
    throw new Error(
      "Live Shippo key: label purchases are disabled. Rates are free; set SHIPPO_ALLOW_PURCHASE=true to actually buy labels.",
    )
  }
  const tx = await api<{
    object_id: string
    label_url: string
    tracking_number: string
    rate?: { provider?: string; amount?: string }
    status: string
  }>("/transactions", {
    method: "POST",
    body: JSON.stringify({ rate: rateId, label_file_type: "PDF", async: false }),
  })
  if (!tx.label_url) throw new Error(`Shippo label not ready (status: ${tx.status})`)
  return {
    transactionId: tx.object_id,
    labelUrl: tx.label_url,
    tracking: tx.tracking_number,
    carrier: tx.rate?.provider ?? "carrier",
    amount: Number(tx.rate?.amount ?? 0),
  }
}

export async function getTracking(carrier: string, tracking: string): Promise<{ status: string; updatedAt: string }> {
  const body = await api<{
    tracking_status?: { status?: string; status_date?: string }
  }>(`/tracks/${carrier}/${tracking}`)
  return {
    status: body.tracking_status?.status ?? "unknown",
    updatedAt: body.tracking_status?.status_date ?? new Date().toISOString(),
  }
}
