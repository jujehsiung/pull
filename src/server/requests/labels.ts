/**
 * Act 3, steps 5–7 — choose a rate, buy the label (gated), reply with the PDF, tracking.
 *
 * Everything acts on the ONE shipments row the showroom intake already wrote for a request
 * (unique on request_id). The stylist owns the money, so:
 *
 *   - `chooseRate` only records a service;
 *   - `purchaseLabel` calls Shippo's `buyLabel`, which refuses a live purchase unless
 *     SHIPPO_ALLOW_PURCHASE=true. The gate is deliberately not bypassed here;
 *   - `sendLabel` refuses without a real label_url and refuses to send the same label twice;
 *   - tracking is refreshed by call or by webhook, and only ever updates the stored status.
 *
 * Each real tool call goes through `withTrace`, so the job trace shows `shippo.label`,
 * `resend.send` and `shippo.track` with duration and Shippo/Resend's own error text.
 */
import { and, asc, eq } from "drizzle-orm"
import { db } from "@/db/client"
import { contacts, emails, jobs, requests, shipments } from "@/db/schema"
import { recordHuman, withTrace } from "@/lib/agent/tracer"
import { buyLabel, getTracking, shippoMode } from "@/lib/shippo"
import { sendEmail } from "@/lib/resend"
import { publicIntakePath } from "@/lib/share"
import { presentRates, type IntakeRateOption } from "@/server/queries/intake"
import { formatMoney } from "@/components/intake/format"

export type RequestRow = typeof requests.$inferSelect
export type ShipmentRow = typeof shipments.$inferSelect
export type EmailRow = typeof emails.$inferSelect

const MAX_LABEL_PDF_BYTES = 8 * 1024 * 1024

export interface LabelPanelEmail {
  id: string
  toEmail: string
  status: string
  sentAt: Date | null
  resendId: string | null
}

export interface LabelPanelState {
  request: RequestRow
  job: typeof jobs.$inferSelect
  shipment: ShipmentRow | null
  contactEmails: string[]
  intakeUrl: string | null
  /** The three presented rate options (all rates stay on the shipment for purchase). */
  presented: IntakeRateOption[]
  /** The sent request email this label reply threads onto. */
  originalEmail: { resendId: string; subject: string } | null
  /** A label reply already sent/queued for this request (the double-send guard). */
  labelEmail: LabelPanelEmail | null
  mode: "live" | "test" | "off"
  purchaseGate: { enabled: boolean; reason: string | null }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Purchases are only possible on a live key when the demo explicitly allows spending. */
export function purchaseGate(): { enabled: boolean; reason: string | null } {
  const mode = shippoMode()
  if (mode === "live" && process.env.SHIPPO_ALLOW_PURCHASE !== "true") {
    return {
      enabled: false,
      reason:
        "Live Shippo key — purchases are disabled until SHIPPO_ALLOW_PURCHASE=true. Rates and the label reply can still be exercised.",
    }
  }
  return { enabled: true, reason: null }
}

export async function getLabelPanelState(requestId: string): Promise<LabelPanelState | null> {
  const [request] = await db().select().from(requests).where(eq(requests.id, requestId)).limit(1)
  if (!request) return null
  const [job] = await db().select().from(jobs).where(eq(jobs.id, request.jobId)).limit(1)
  if (!job) return null

  const [contact] = request.contactId
    ? await db().select().from(contacts).where(eq(contacts.id, request.contactId)).limit(1)
    : [null]
  const [shipment] = await db()
    .select()
    .from(shipments)
    .where(eq(shipments.requestId, requestId))
    .limit(1)
  const emailRows = await db()
    .select()
    .from(emails)
    .where(eq(emails.requestId, requestId))
    .orderBy(asc(emails.createdAt))

  const labelEmailRow = [...emailRows]
    .reverse()
    .find((row) => Array.isArray(row.attachments) && row.attachments.length > 0)
  // The label reply lives in this table too; only a sent email without attachments is the
  // request email to thread onto.
  const originalRow =
    emailRows.find(
      (row) =>
        row.status === "sent" &&
        row.resendId &&
        !(Array.isArray(row.attachments) && row.attachments.length > 0),
    ) ?? null

  return {
    request,
    job,
    shipment: shipment ?? null,
    contactEmails: contact?.emails ?? [],
    intakeUrl: request.intakeToken ? publicIntakePath(request.intakeToken) : null,
    presented: presentRates(shipment?.rates),
    originalEmail: originalRow?.resendId
      ? { resendId: originalRow.resendId, subject: originalRow.subject }
      : null,
    labelEmail: labelEmailRow
      ? {
          id: labelEmailRow.id,
          toEmail: labelEmailRow.toEmail,
          status: labelEmailRow.status,
          sentAt: labelEmailRow.sentAt,
          resendId: labelEmailRow.resendId,
        }
      : null,
    mode: shippoMode(),
    purchaseGate: purchaseGate(),
  }
}

export interface LabelActionResult {
  ok: boolean
  error?: string
  message?: string
}

async function requestWithShipment(requestId: string) {
  const [request] = await db().select().from(requests).where(eq(requests.id, requestId)).limit(1)
  if (!request) return null
  const [shipment] = await db()
    .select()
    .from(shipments)
    .where(eq(shipments.requestId, requestId))
    .limit(1)
  return { request, shipment: shipment ?? null }
}

/** FR-19 step 1: remember which quoted service the stylist picked. No money, no Shippo call. */
export async function chooseRate(requestId: string, rateId: string): Promise<LabelActionResult> {
  const ctx = await requestWithShipment(requestId)
  if (!ctx) return { ok: false, error: "Request not found." }
  const { request, shipment } = ctx
  if (!shipment) {
    return { ok: false, error: "No intake yet — the showroom needs to submit the parcel before a rate can be chosen." }
  }
  if (shipment.labelUrl || shipment.trackingNumber) {
    return { ok: false, error: "A label has already been bought for this request, so the rate cannot be changed." }
  }
  const rate = (shipment.rates ?? []).find((entry) => entry.id === rateId)
  if (!rate) {
    return { ok: false, error: "That rate is not on this shipment. Pick one of the quoted options." }
  }

  await db()
    .update(shipments)
    .set({
      chosenRateId: rate.id,
      carrier: rate.carrier,
      service: rate.service,
      amountCents: Math.round(rate.amount * 100),
      currency: rate.currency,
      etaDays: rate.days,
    })
    .where(eq(shipments.requestId, requestId))
  await recordHuman(request.jobId, "label.rate_chosen", {
    requestId,
    carrier: rate.carrier,
    service: rate.service,
    amount: rate.amount,
    currency: rate.currency,
  })

  return {
    ok: true,
    message: `${rate.carrier} ${rate.service} chosen — ${formatMoney(rate.amount, rate.currency)} · ${rate.days} ${
      rate.days === 1 ? "day" : "days"
    }.`,
  }
}

/**
 * FR-19: buy the label for the chosen rate. `buyLabel` enforces the SHIPPO_ALLOW_PURCHASE gate;
 * this function must not work around it. A failed/blocked purchase writes nothing.
 */
export async function purchaseLabel(requestId: string): Promise<LabelActionResult> {
  const ctx = await requestWithShipment(requestId)
  if (!ctx) return { ok: false, error: "Request not found." }
  const { request, shipment } = ctx
  if (!shipment) return { ok: false, error: "No intake yet — there is nothing to buy." }
  if (shipment.labelUrl || shipment.trackingNumber) {
    return { ok: false, error: "A label has already been bought for this request. A second purchase is blocked." }
  }
  if (!shipment.chosenRateId) {
    return { ok: false, error: "Choose a rate before buying the label." }
  }

  try {
    const bought = await withTrace(
      {
        jobId: request.jobId,
        tool: "shippo.label",
        args: {
          requestId,
          rateId: shipment.chosenRateId,
          amountCents: shipment.amountCents ?? null,
          currency: shipment.currency ?? null,
        },
      },
      () => buyLabel(shipment.chosenRateId as string),
    )

    await db()
      .update(shipments)
      .set({
        labelUrl: bought.labelUrl,
        trackingNumber: bought.tracking,
        trackingStatus: "label_issued",
        trackingUpdatedAt: new Date(),
        carrier: bought.carrier || shipment.carrier,
        service: shipment.service,
      })
      .where(eq(shipments.requestId, requestId))
    await recordHuman(request.jobId, "label.bought", {
      requestId,
      carrier: bought.carrier,
      amount: bought.amount,
      tracking: bought.tracking,
    })

    return {
      ok: true,
      message: `Label bought — ${bought.carrier || "carrier"}, tracking ${bought.tracking}.`,
    }
  } catch (error) {
    // withTrace recorded the provider/gate error verbatim; surface it as-is.
    return { ok: false, error: messageOf(error) }
  }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function replyBody(input: {
  brand: string
  tracking: string | null
  carrier: string | null
  service: string | null
  pickup: Record<string, string>
  parcel: string
}): string {
  const pickup = [input.pickup.street1, input.pickup.city, input.pickup.zip, input.pickup.country]
    .filter(Boolean)
    .join(", ")
  return [
    `Hi ${input.brand} team,`,
    "",
    "The prepaid label for the sample request is attached. Please print it and hand the parcel to the courier.",
    "",
    `TRACKING: ${input.tracking ?? "—"}`,
    input.carrier || input.service ? `CARRIER: ${[input.carrier, input.service].filter(Boolean).join(" · ")}` : "",
    `PARCEL: ${input.parcel}`,
    pickup ? `PICKUP: ${pickup}${input.pickup.date ? ` · ${input.pickup.date}` : ""}${input.pickup.window ? ` · ${input.pickup.window}` : ""}` : "",
    "",
    "Thank you,",
    "Juje",
  ]
    .filter((line) => line !== "")
    .join("\n")
}

/**
 * FR-20: email the label PDF in the original thread and mark the request `label_sent`.
 *
 * Refuses without a real label_url, and refuses a second send for the same request. A queued row
 * is inserted before the Resend call so a double click cannot produce two sends; a failed send
 * leaves a `bounced` row that a retry reuses.
 */
export async function sendLabel(requestId: string): Promise<LabelActionResult> {
  const ctx = await requestWithShipment(requestId)
  if (!ctx) return { ok: false, error: "Request not found." }
  const { request, shipment } = ctx
  if (!shipment?.labelUrl) {
    return { ok: false, error: "There is no label to send yet. Buy the label first — nothing was sent." }
  }

  const [contact] = request.contactId
    ? await db().select().from(contacts).where(eq(contacts.id, request.contactId)).limit(1)
    : [null]
  const to = contact?.emails?.[0]?.trim() ?? ""
  if (!to) {
    return { ok: false, error: "This request has no resolved contact email — nothing was sent." }
  }

  const emailRows = await db()
    .select()
    .from(emails)
    .where(eq(emails.requestId, requestId))
    .orderBy(asc(emails.createdAt))
  const labelRows = emailRows.filter((row) => Array.isArray(row.attachments) && row.attachments.length > 0)
  const existing = [...labelRows].reverse()[0] ?? null
  if (existing && (existing.status === "sent" || existing.status === "queued")) {
    return {
      ok: false,
      error: `The label has already been sent to ${existing.toEmail}. A second send is blocked.`,
    }
  }

  const originalEmail =
    emailRows.find(
      (row) =>
        row.status === "sent" &&
        row.resendId &&
        !(Array.isArray(row.attachments) && row.attachments.length > 0),
    ) ?? null
  const tracking = shipment.trackingNumber
  const filename = `label-${tracking ?? request.brand.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`

  let pdf: Buffer
  try {
    const response = await fetch(shipment.labelUrl, { cache: "no-store" })
    if (!response.ok) throw new Error(`Could not download the label PDF (${response.status}).`)
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.byteLength === 0) throw new Error("The label PDF came back empty.")
    if (bytes.byteLength > MAX_LABEL_PDF_BYTES) throw new Error("The label PDF is too large to attach.")
    pdf = bytes
  } catch (error) {
    return { ok: false, error: `The label is not ready to email. ${messageOf(error)} Nothing was sent.` }
  }

  const subject = originalEmail
    ? `Re: ${originalEmail.subject.replace(/^re:\s*/i, "")} — label and tracking`
    : `PULL — label and tracking for ${request.brand}`
  const body = replyBody({
    brand: request.brand,
    tracking,
    carrier: shipment.carrier,
    service: shipment.service,
    pickup: (shipment.intake?.pickup ?? {}) as Record<string, string>,
    parcel: shipment.intake
      ? `${shipment.intake.length} × ${shipment.intake.width} × ${shipment.intake.height} cm · ${shipment.intake.weightKg} kg`
      : "—",
  })
  const html = `<div style="font-family:Inter,system-ui,sans-serif;max-width:600px;white-space:pre-wrap;color:#2c2c2b">${escapeHtml(body)}</div>`
  const headers = originalEmail?.resendId
    ? { "In-Reply-To": `<${originalEmail.resendId}>`, References: `<${originalEmail.resendId}>` }
    : undefined

  // Claim the send before calling Resend: a queued row with an attachment is the double-send lock.
  let claim: EmailRow
  if (existing && existing.status === "bounced") {
    ;[claim] = await db()
      .update(emails)
      .set({
        toEmail: to,
        subject,
        body,
        status: "queued",
        resendId: null,
        sentAt: null,
        inReplyTo: originalEmail?.resendId ?? null,
        attachments: [{ filename }],
      })
      .where(eq(emails.id, existing.id))
      .returning()
  } else {
    ;[claim] = await db()
      .insert(emails)
      .values({
        jobId: request.jobId,
        requestId,
        toEmail: to,
        subject,
        body,
        status: "queued",
        inReplyTo: originalEmail?.resendId ?? null,
        attachments: [{ filename }],
      })
      .returning()
  }

  const competing = (
    await db().select().from(emails).where(eq(emails.requestId, requestId))
  ).filter(
    (row) =>
      row.id !== claim.id &&
      (row.status === "queued" || row.status === "sent") &&
      Array.isArray(row.attachments) &&
      row.attachments.length > 0,
  )
  if (competing.length > 0) {
    await db().delete(emails).where(eq(emails.id, claim.id))
    return { ok: false, error: "The label is already being sent for this request. A second send is blocked." }
  }

  try {
    const sent = await withTrace(
      {
        jobId: request.jobId,
        tool: "resend.send",
        args: { requestId, to, attachment: filename, tracking },
      },
      () =>
        sendEmail({
          to,
          subject,
          text: body,
          html,
          headers,
          attachments: [{ filename, content: pdf.toString("base64") }],
        }),
    )
    await db()
      .update(emails)
      .set({ status: "sent", resendId: sent.id, sentAt: new Date(), lastEventAt: new Date() })
      .where(eq(emails.id, claim.id))
    await db().update(requests).set({ status: "label_sent" }).where(eq(requests.id, requestId))
    await recordHuman(request.jobId, "label.sent", { requestId, to, tracking })

    return { ok: true, message: `Label sent to ${to}${tracking ? ` · tracking ${tracking}` : ""}.` }
  } catch (error) {
    await db().update(emails).set({ status: "bounced" }).where(eq(emails.id, claim.id))
    return { ok: false, error: `${messageOf(error)} Nothing was sent; try again.` }
  }
}

/** Map Shippo tracking statuses onto the five the UI speaks. */
export function mapTrackingStatus(raw: string | null | undefined): string {
  const key = String(raw ?? "")
    .toUpperCase()
    .trim()
    .replace(/[\s-]+/g, "_")
  if (!key) return "label_issued"
  if (key.includes("OUT_FOR_DELIVERY")) return "out_for_delivery"
  if (key.includes("DELIVER") && !key.includes("UNDELIVER")) return "delivered"
  if (key === "TRANSIT" || key.includes("IN_TRANSIT")) return "in_transit"
  if (key === "PRE_TRANSIT" || key === "LABEL_ISSUED" || key === "UNKNOWN") return "label_issued"
  if (
    key.includes("RETURN") ||
    key.includes("FAIL") ||
    key.includes("CANCEL") ||
    key.includes("EXCEPTION") ||
    key.includes("ERROR")
  ) {
    return "exception"
  }
  return "exception"
}

export function trackingLabel(status: string | null | undefined): string {
  switch (status) {
    case "label_issued":
      return "Label issued"
    case "in_transit":
      return "In transit"
    case "out_for_delivery":
      return "Out for delivery"
    case "delivered":
      return "Delivered"
    case "exception":
      return "Exception"
    default:
      return status ?? "Unknown"
  }
}

/** Keep the request's own status in step with a delivered/transit shipment. */
async function syncRequestStatus(requestId: string, shipmentStatus: string): Promise<void> {
  const [request] = await db().select().from(requests).where(eq(requests.id, requestId)).limit(1)
  if (!request || request.status === "delivered") return
  if (shipmentStatus === "delivered") {
    await db().update(requests).set({ status: "delivered" }).where(eq(requests.id, requestId))
  } else if (shipmentStatus === "in_transit" || shipmentStatus === "out_for_delivery") {
    await db().update(requests).set({ status: "in_transit" }).where(eq(requests.id, requestId))
  }
}

/** FR-21: ask Shippo for the tracking status now. */
export async function refreshTracking(requestId: string): Promise<LabelActionResult & { status?: string }> {
  const ctx = await requestWithShipment(requestId)
  if (!ctx) return { ok: false, error: "Request not found." }
  const { request, shipment } = ctx
  if (!shipment?.trackingNumber) {
    return { ok: false, error: "There is no tracking number yet — buy the label first." }
  }
  const carrier = shipment.carrier?.trim() || "shippo"

  try {
    const tracking = await withTrace(
      {
        jobId: request.jobId,
        tool: "shippo.track",
        args: { requestId, carrier, tracking: shipment.trackingNumber },
      },
      () => getTracking(carrier, shipment.trackingNumber as string),
    )
    const status = mapTrackingStatus(tracking.status)
    const updatedAt = Number.isNaN(Date.parse(tracking.updatedAt)) ? new Date() : new Date(tracking.updatedAt)
    await db()
      .update(shipments)
      .set({ trackingStatus: status, trackingUpdatedAt: updatedAt })
      .where(eq(shipments.requestId, requestId))
    await syncRequestStatus(requestId, status)
    return { ok: true, status, message: `Tracking refreshed — ${trackingLabel(status)}.` }
  } catch (error) {
    return { ok: false, error: messageOf(error), status: shipment.trackingStatus ?? undefined }
  }
}

/**
 * FR-21 webhook path: Shippo `track_updated` → find the shipment by tracking number and mirror the
 * status. Returns found:false for unknown numbers so the route can still answer 200.
 */
export async function applyTrackingWebhook(
  trackingNumber: string,
  rawStatus: string | null | undefined,
  updatedAtIso?: string | null,
): Promise<{ found: boolean; status: string | null }> {
  const trimmed = trackingNumber.trim()
  if (!trimmed) return { found: false, status: null }
  const [shipment] = await db()
    .select()
    .from(shipments)
    .where(eq(shipments.trackingNumber, trimmed))
    .limit(1)
  if (!shipment) return { found: false, status: null }

  const status = mapTrackingStatus(rawStatus)
  const updatedAt =
    updatedAtIso && !Number.isNaN(Date.parse(updatedAtIso)) ? new Date(updatedAtIso) : new Date()
  await db()
    .update(shipments)
    .set({ trackingStatus: status, trackingUpdatedAt: updatedAt })
    .where(eq(shipments.id, shipment.id))
  await syncRequestStatus(shipment.requestId, status)
  return { found: true, status }
}
