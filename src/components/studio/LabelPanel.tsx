/**
 * Per-request label panel (Act 3, FR-18 → FR-21), mounted by the requests page as
 * `<LabelPanel requestId={request.id} />`.
 *
 * It reads the shipment row itself — the showroom's intake writes it and the stylist only ever picks
 * a rate here. Three states:
 *   (a) no rates yet  → waiting for the showroom, with the intake link to resend;
 *   (b) rates          → the three quoted services, choose one, then the money-spending buy button
 *                        (visually gated when SHIPPO_ALLOW_PURCHASE is not true on a live key);
 *   (c) label bought   → PDF link, tracking number/status, "reply with label" and "refresh tracking".
 *
 * Every button is a plain form posting to a server action (src/server/actions/labels.ts), so the
 * flow works without JavaScript; outcomes land in the requests page's existing flash banner.
 */
import type { IntakeRateOption } from "@/server/queries/intake"
import {
  chooseRateForm,
  purchaseLabelForm,
  refreshTrackingForm,
  sendLabelForm,
} from "@/server/actions/labels"
import { getLabelPanelState, trackingLabel } from "@/server/requests/labels"
import { formatDays, formatMoney } from "@/components/intake/format"

const REQUEST_STATUS: Record<string, string> = {
  draft: "Draft",
  sent: "Request sent",
  awaiting_label: "Awaiting label",
  label_sent: "Label sent",
  in_transit: "In transit",
  delivered: "Delivered",
  failed: "Failed",
}

function utcDateTime(value: Date | null | undefined): string {
  if (!value) return "—"
  return `${value.toISOString().slice(0, 16).replace("T", " ")} UTC`
}

function RateRow({ requestId, rate, chosen }: { requestId: string; rate: IntakeRateOption; chosen: boolean }) {
  return (
    <div
      className="rate-option"
      style={{
        marginTop: 0,
        borderColor: chosen ? "var(--ink)" : undefined,
        background: chosen ? "var(--accent)" : undefined,
      }}
    >
      <div className="rate-main" style={{ minWidth: 0 }}>
        <div className="rate-name" style={{ overflowWrap: "anywhere" }}>
          {rate.carrier}
        </div>
        <div className="rate-meta">
          {rate.service} · {formatDays(rate.days)}
        </div>
      </div>
      <div className="rate-price" style={{ whiteSpace: "nowrap" }}>
        {formatMoney(rate.amount, rate.currency)}
      </div>
      <form action={chooseRateForm}>
        <input type="hidden" name="requestId" value={requestId} />
        <input type="hidden" name="rateId" value={rate.id} />
        <button type="submit" className="btn btn-ghost btn-sm" disabled={chosen}>
          {chosen ? "Chosen" : "Choose"}
        </button>
      </form>
    </div>
  )
}

export async function LabelPanel({ requestId }: { requestId: string }) {
  const state = await getLabelPanelState(requestId)
  if (!state) return null

  const { request, shipment, presented, purchaseGate, intakeUrl, labelEmail, contactEmails } = state
  const rates = presented
  const hasLabel = Boolean(shipment?.labelUrl || shipment?.trackingNumber)
  const chosenRate = shipment?.chosenRateId
    ? (shipment.rates ?? []).find((rate) => rate.id === shipment.chosenRateId)
    : undefined
  const labelAlreadyEmailed = labelEmail?.status === "sent" || labelEmail?.status === "queued"
  const contactEmail = contactEmails[0] ?? ""

  return (
    <section
      className="card"
      style={{ padding: 20, marginTop: 14 }}
      aria-label={`Label for ${request.brand}`}
    >
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <p className="eyebrow">Label · Shippo</p>
        <span className="row" style={{ gap: 6 }}>
          <span className="chip">{state.mode === "test" ? "Test mode" : state.mode === "live" ? "Live" : "Off"}</span>
          <span className="chip">{REQUEST_STATUS[request.status] ?? request.status}</span>
        </span>
      </div>

      {rates.length === 0 && !hasLabel ? (
        <div style={{ marginTop: 12 }}>
          <p className="small" style={{ margin: 0 }}>
            {request.shippingMode === "showroom_ships"
              ? "This showroom ships on its own account — no prepaid label is needed for this request."
              : "Waiting for the showroom to enter the parcel and pickup details. Rates will appear here."}
          </p>
          {intakeUrl && request.shippingMode !== "showroom_ships" ? (
            <p className="mono" style={{ marginTop: 10, wordBreak: "break-all", color: "var(--muted-foreground)" }}>
              INTAKE {intakeUrl}
            </p>
          ) : null}
        </div>
      ) : null}

      {rates.length > 0 && !hasLabel ? (
        <>
          <p className="small" style={{ marginTop: 10 }}>
            {shipment?.intake
              ? `${shipment.intake.length} × ${shipment.intake.width} × ${shipment.intake.height} cm · ${shipment.intake.weightKg} kg`
              : "Quoted parcel"}
            {chosenRate ? ` · ${chosenRate.carrier} ${chosenRate.service} chosen` : " · choose a service"}
          </p>

          <div className="stack" style={{ gap: 8, marginTop: 12 }}>
            {rates.map((rate) => (
              <RateRow key={rate.id} requestId={request.id} rate={rate} chosen={rate.id === chosenRate?.id} />
            ))}
          </div>

          <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
            {chosenRate ? (
              <>
                <p className="small" style={{ margin: 0 }}>
                  Chosen: <b>{chosenRate.carrier}</b> · {chosenRate.service} ·{" "}
                  {formatMoney(chosenRate.amount, chosenRate.currency)} · {formatDays(chosenRate.days)}
                </p>
                {!purchaseGate.enabled ? (
                  <p className="small" role="note" style={{ marginTop: 8, color: "var(--muted-foreground)" }}>
                    {purchaseGate.reason}
                  </p>
                ) : (
                  <p className="small" style={{ marginTop: 8, color: "var(--danger)" }}>
                    This spends money on the Shippo account — {formatMoney(chosenRate.amount, chosenRate.currency)}.
                  </p>
                )}
                <form action={purchaseLabelForm} style={{ marginTop: 10 }}>
                  <input type="hidden" name="requestId" value={request.id} />
                  <button type="submit" className="btn btn-primary" disabled={!purchaseGate.enabled}>
                    Buy label — {formatMoney(chosenRate.amount, chosenRate.currency)} (spends money)
                  </button>
                </form>
              </>
            ) : (
              <p className="small" style={{ margin: 0, color: "var(--muted-foreground)" }}>
                Choose a service above to enable the purchase. The showroom never buys the label.
              </p>
            )}
          </div>
        </>
      ) : null}

      {hasLabel && shipment ? (
        <>
          <div className="label-preview" style={{ marginTop: 14 }} aria-label="Label details">
            <span>Tracking</span>
            <span>{shipment.trackingNumber ?? "—"}</span>
            <span>Carrier</span>
            <span>{[shipment.carrier, shipment.service].filter(Boolean).join(" · ") || "—"}</span>
            <span>Parcel</span>
            <span>
              {shipment.intake
                ? `${shipment.intake.length} × ${shipment.intake.width} × ${shipment.intake.height} cm · ${shipment.intake.weightKg} kg`
                : "—"}
            </span>
            <span>Status</span>
            <span>
              {trackingLabel(shipment.trackingStatus)}
              {shipment.trackingStatus === "exception" ? " — check the carrier" : ""}
            </span>
            <span>Updated</span>
            <span>{utcDateTime(shipment.trackingUpdatedAt)}</span>
            {shipment.amountCents ? (
              <>
                <span>Cost</span>
                <span>{formatMoney(shipment.amountCents / 100, shipment.currency ?? "USD")}</span>
              </>
            ) : null}
          </div>

          <div className="row" style={{ gap: 8, marginTop: 14 }}>
            {shipment.labelUrl ? (
              <a className="btn btn-ghost btn-sm" href={shipment.labelUrl} target="_blank" rel="noreferrer">
                Open label PDF
              </a>
            ) : null}
            <form action={refreshTrackingForm}>
              <input type="hidden" name="requestId" value={request.id} />
              <button type="submit" className="btn btn-ghost btn-sm" disabled={!shipment.trackingNumber}>
                Refresh tracking
              </button>
            </form>
          </div>

          <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
            {labelAlreadyEmailed ? (
              <p className="small" style={{ margin: 0, color: "var(--ok)" }}>
                Label {labelEmail?.status === "queued" ? "sending" : "sent"} to {labelEmail?.toEmail}
                {labelEmail?.status === "sent" ? ` · ${utcDateTime(labelEmail.sentAt)}` : ""}
                {labelEmail?.resendId ? ` · Resend ${labelEmail.resendId.slice(0, 8)}…` : ""}
              </p>
            ) : (
              <>
                {labelEmail?.status === "bounced" ? (
                  <p className="small" role="alert" style={{ margin: 0, color: "var(--danger)" }}>
                    The last attempt to email this label failed. Try again.
                  </p>
                ) : null}
                <p className="small" style={{ margin: 0 }}>
                  Reply to the brand thread {contactEmail ? `(${contactEmail})` : "(contact missing)"} with
                  the label PDF attached and the tracking number in the body.
                </p>
                <form action={sendLabelForm} style={{ marginTop: 10 }}>
                  <input type="hidden" name="requestId" value={request.id} />
                  <button type="submit" className="btn btn-primary btn-sm" disabled={!contactEmail}>
                    Reply with label
                  </button>
                </form>
              </>
            )}
          </div>
        </>
      ) : null}
    </section>
  )
}
