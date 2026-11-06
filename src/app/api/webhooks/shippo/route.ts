/**
 * Shippo tracking webhook (FR-21).
 *
 * Shippo POSTs a `track_updated` event; we mirror only the status and its timestamp onto the
 * shipments row whose tracking_number matches. The endpoint is idempotent by design (last event
 * wins) and answers 200 for anything it cannot use — a webhook receiver that 500s makes the
 * provider retry a payload we will never be able to place.
 *
 * Auth: when SHIPPO_WEBHOOK_SECRET is set, the secret must be presented either as the
 * `x-shippo-webhook-secret` header or as `?secret=` on the webhook URL (Shippo can be configured
 * with either). When it is unset the endpoint accepts unsigned updates and warns once — demo only.
 */
import { NextResponse } from "next/server"
import { applyTrackingWebhook } from "@/server/requests/labels"

export const runtime = "nodejs"

let warnedUnauthenticated = false

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

export async function POST(request: Request) {
  const secret = process.env.SHIPPO_WEBHOOK_SECRET?.trim()
  if (secret) {
    const url = new URL(request.url)
    const provided =
      request.headers.get("x-shippo-webhook-secret")?.trim() || url.searchParams.get("secret")?.trim() || ""
    if (provided !== secret) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
    }
  } else if (!warnedUnauthenticated) {
    warnedUnauthenticated = true
    console.warn(
      "[shippo-webhook] SHIPPO_WEBHOOK_SECRET is not set — accepting unsigned tracking updates (demo only).",
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: true, ignored: true, reason: "invalid json" })
  }

  const envelope = asRecord(body)
  const data = asRecord(envelope?.data) ?? envelope
  const trackingNumber =
    text(data?.tracking_number) || text(data?.trackingNumber) || text(asRecord(data?.tracking)?.number)
  if (!trackingNumber) {
    return NextResponse.json({ ok: true, ignored: true, reason: "no tracking number" })
  }

  const trackingStatus = asRecord(data?.tracking_status) ?? asRecord(data?.trackingStatus)
  const rawStatus = text(trackingStatus?.status) || text(data?.status) || text(envelope?.event)
  const updatedAt =
    text(trackingStatus?.status_date) ||
    text(trackingStatus?.statusDate) ||
    text(data?.updated_at) ||
    null

  try {
    const result = await applyTrackingWebhook(trackingNumber, rawStatus, updatedAt)
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    // The provider's retry would deliver the same event again; log and accept.
    console.error("[shippo-webhook] could not store tracking update", error)
    return NextResponse.json({ ok: true, stored: false })
  }
}
