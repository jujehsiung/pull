/**
 * The public showroom intake mutation (Act 3, FR-17 / FR-18).
 *
 * One server action, and it re-authorises the bearer token on every call before reading a single
 * field. It then:
 *   1. validates the parcel + pickup (the form's native constraints are a convenience, this is the
 *      authority),
 *   2. refuses before calling Shippo if the stylist's studio address is incomplete — a clear message
 *      instead of a carrier 400,
 *   3. gets rates through `withTrace({ tool: "shippo.rates" })`, so the call (including Shippo's own
 *      error text) is in the job's agent trace,
 *   4. writes ONE shipments row only after rates come back, keyed on request_id so a retry updates
 *      rather than duplicates. A failure anywhere before that leaves the database untouched.
 *
 * It never buys a label: that is the stylist's separate, gated action (lead-owned).
 */
"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/db/client"
import { shipments } from "@/db/schema"
import { recordSteps, withTrace } from "@/lib/agent/tracer"
import { getRates, shippoConfigured, shippoMode } from "@/lib/shippo"
import type { Address, Parcel } from "@/lib/shippo"
import {
  authorizeIntakeToken,
  isoDatePlusDays,
  parcelSummary,
  presentRates,
  studioAddressToShippo,
} from "@/server/queries/intake"
import { COUNTRY_OPTIONS, PICKUP_WINDOWS } from "@/components/intake/constants"
import type { IntakeFormState } from "@/components/intake/types"

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

interface CleanForm {
  parcel: Parcel
  pickup: Record<string, string>
  from: Address
  errors: string[]
}

function cleanForm(form: FormData): CleanForm {
  const errors: string[] = []
  const text = (key: string): string => String(form.get(key) ?? "").trim()

  const num = (key: string, label: string, min: number, max: number, decimals: number): number => {
    const raw = text(key).replace(",", ".")
    const value = Number(raw)
    if (!raw || !Number.isFinite(value)) {
      errors.push(`${label} is required.`)
      return min
    }
    if (value < min || value > max) {
      errors.push(`${label} must be between ${min} and ${max}.`)
      return min
    }
    const factor = 10 ** decimals
    return Math.round(value * factor) / factor
  }

  const length = num("length", "Length", 5, 200, 0)
  const width = num("width", "Width", 5, 200, 0)
  const height = num("height", "Height", 5, 200, 0)
  const weightKg = num("weightKg", "Weight", 0.05, 50, 1)

  const name = text("name")
  if (name.length < 2 || name.length > 80) errors.push("The pickup contact's name is required.")
  const phone = text("phone")
  const digits = phone.replace(/\D/g, "")
  if (digits.length < 7 || digits.length > 15) errors.push("A pickup phone number is required.")
  const email = text("email")
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("That email address does not look right.")

  const street1 = text("street1")
  if (street1.length < 3 || street1.length > 120) errors.push("A street address is required.")
  const street2 = text("street2").slice(0, 120)
  const city = text("city")
  if (city.length < 2 || city.length > 60) errors.push("A city is required.")
  const state = text("state").slice(0, 60)
  const zip = text("zip")
  if (!/^[A-Za-z0-9][A-Za-z0-9 -]{2,11}$/.test(zip)) errors.push("A valid postcode / ZIP is required.")
  const country = text("country").toUpperCase()
  if (!/^[A-Z]{2}$/.test(country)) {
    errors.push("Pick a 2-letter country code.")
  } else if (!(COUNTRY_OPTIONS as readonly string[]).includes(country)) {
    errors.push("Pick the pickup country from the list.")
  }
  if (country === "US" && !/^[A-Za-z]{2}$/.test(state)) {
    errors.push("A 2-letter state is required for US pickups.")
  }

  const pickupDate = text("pickupDate")
  if (!/^\d{4}-\d{2}-\d{2}$/.test(pickupDate) || Number.isNaN(Date.parse(pickupDate))) {
    errors.push("Pick a pickup date.")
  } else {
    const today = new Date().toISOString().slice(0, 10)
    if (pickupDate < today) errors.push("The pickup date cannot be in the past.")
    else if (pickupDate > isoDatePlusDays(60)) errors.push("The pickup date must be within 60 days.")
  }
  const windowRaw = text("pickupWindow")
  const pickupWindow = (PICKUP_WINDOWS as readonly string[]).includes(windowRaw) ? windowRaw : ""
  if (!pickupWindow) errors.push("Pick a pickup window.")

  return {
    parcel: { length, width, height, weightKg },
    pickup: {
      name,
      phone,
      email,
      street1,
      street2,
      city,
      state,
      zip,
      country,
      date: pickupDate,
      window: pickupWindow,
    },
    from: {
      name,
      street1,
      city,
      state: state || undefined,
      zip,
      country,
      phone,
      email: email || undefined,
    },
    errors,
  }
}

export async function submitIntake(_previous: IntakeFormState, form: FormData): Promise<IntakeFormState> {
  const token = String(form.get("token") ?? "")
  const ctx = await authorizeIntakeToken(token)
  if (!ctx) {
    return {
      status: "error",
      error: "This label link is no longer valid. Ask your PULL contact for a new one.",
    }
  }
  if (ctx.shipment?.labelUrl || ctx.shipment?.chosenRateId) {
    return {
      status: "error",
      error: "A label has already been issued for this request — nothing was changed.",
    }
  }
  if (!shippoConfigured()) {
    return {
      status: "error",
      error: "Shippo is not connected, so rates cannot be quoted right now. Try again later.",
    }
  }

  const clean = cleanForm(form)
  if (clean.errors.length > 0) {
    return { status: "error", error: clean.errors.join(" ") }
  }

  const studio = studioAddressToShippo(ctx.stylist?.studioAddress ?? null)
  if (!studio.address) {
    const error = `The studio address is incomplete — missing ${studio.missing.join(", ")}. Ask the stylist to add it in the studio settings; nothing was sent to Shippo.`
    await recordSteps([
      {
        jobId: ctx.job.id,
        tool: "shippo.rates",
        status: "error",
        args: { requestId: ctx.request.id, stage: "studio-address", missing: studio.missing },
        error,
        durationMs: 0,
      },
    ])
    return { status: "error", error }
  }
  const destination = studio.address

  let result: Awaited<ReturnType<typeof getRates>>
  try {
    result = await withTrace(
      {
        jobId: ctx.job.id,
        tool: "shippo.rates",
        args: {
          requestId: ctx.request.id,
          from: { city: clean.from.city, zip: clean.from.zip, country: clean.from.country },
          to: { city: destination.city, zip: destination.zip, country: destination.country },
          parcel: clean.parcel,
        },
      },
      () =>
        getRates({
          from: clean.from,
          to: destination,
          parcel: clean.parcel,
          declaredValue: 150,
        }),
    )
  } catch (error) {
    // withTrace already recorded the failed step, provider text verbatim.
    return {
      status: "error",
      error: `Shippo did not return rates. ${messageOf(error)} Nothing was saved — try again.`,
    }
  }

  if (result.rates.length === 0) {
    const note = result.messages.length > 0 ? result.messages.join(" ") : "No carrier quoted this lane and parcel."
    const error = `Shippo returned no rates: ${note}`
    // The call itself answered, but the outcome is unusable; the trace must say so, with Shippo's text.
    await recordSteps([
      {
        jobId: ctx.job.id,
        tool: "shippo.rates",
        status: "error",
        args: { requestId: ctx.request.id, stage: "no-rates" },
        error,
        durationMs: 0,
      },
    ])
    return {
      status: "error",
      error: `${error} Nothing was saved — try again.`,
    }
  }

  const presented = presentRates(result.rates)
  const intake = { ...clean.parcel, pickup: clean.pickup }

  try {
    // One row per request (unique index), so a retry replaces the rates instead of duplicating.
    await db()
      .insert(shipments)
      .values({
        requestId: ctx.request.id,
        shippoShipmentId: result.shipmentId,
        intake,
        rates: result.rates,
        chosenRateId: null,
      })
      .onConflictDoUpdate({
        target: shipments.requestId,
        set: {
          shippoShipmentId: result.shipmentId,
          intake,
          rates: result.rates,
          chosenRateId: null,
        },
      })
  } catch (error) {
    return {
      status: "error",
      error: `The rates came back but could not be saved. ${messageOf(error)} Try again.`,
    }
  }

  revalidatePath(`/i/${token}`)
  revalidatePath(`/studio/jobs/${ctx.job.id}`)

  return {
    status: "rated",
    presented,
    shipmentId: result.shipmentId,
    parcelSummary: parcelSummary(clean.parcel),
    routeSummary: `${clean.from.city} → ${destination.city}`,
    mode: shippoMode(),
    messages: result.messages,
  }
}
