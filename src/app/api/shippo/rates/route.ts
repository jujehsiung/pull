import { NextResponse } from "next/server"
import { z } from "zod"
import { getRates, shippoConfigured, shippoMode } from "@/lib/shippo"

/**
 * POST /api/shippo/rates — real Shippo rates for a parcel.
 * Free to call: a shipment and its rates cost nothing; only buying a label spends money.
 * Used by the showroom intake page and by the setup verification.
 */
const bodySchema = z.object({
  from: z.object({
    name: z.string(),
    street1: z.string(),
    city: z.string(),
    state: z.string().optional(),
    zip: z.string(),
    country: z.string(),
    phone: z.string().optional(),
    email: z.string().optional(),
  }),
  to: z.object({
    name: z.string(),
    street1: z.string(),
    city: z.string(),
    state: z.string().optional(),
    zip: z.string(),
    country: z.string(),
    phone: z.string().optional(),
    email: z.string().optional(),
  }),
  parcel: z.object({
    length: z.number().positive(),
    width: z.number().positive(),
    height: z.number().positive(),
    weightKg: z.number().positive(),
  }),
  declaredValue: z.number().positive().optional(),
  customsDescription: z.string().max(120).optional(),
})

export async function POST(request: Request) {
  if (!shippoConfigured()) {
    return NextResponse.json(
      { error: "Shippo not connected", hint: "add SHIPPO_API_KEY to .env.local (SETUP.md step 5)" },
      { status: 503 },
    )
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 })
  }

  try {
    const { shipmentId, rates, messages } = await getRates(parsed.data)
    const international = parsed.data.from.country !== parsed.data.to.country
    return NextResponse.json({
      mode: shippoMode(),
      shipmentId,
      international,
      rates,
      messages,
      cheapest: rates[0] ?? null,
      fastest: rates.length ? rates.reduce((a, b) => (b.days < a.days ? b : a)) : null,
      ...(rates.length === 0
        ? {
            hint: international
              ? "No cross-border rates: connect a carrier that supports this lane in Shippo (e.g. DHL Express, UPS international), or the lane is unsupported by your carrier accounts."
              : "No rates: check the addresses and parcel in Shippo → Settings → Carrier accounts.",
          }
        : {}),
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 },
    )
  }
}

export async function GET() {
  return NextResponse.json({ configured: shippoConfigured(), mode: shippoMode() })
}
