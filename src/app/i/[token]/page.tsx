/**
 * /i/[token] — the public showroom intake (Act 3, FR-17 / FR-18).
 *
 * A showroom with no account opens a bearer link, enters the parcel + pickup details, and gets
 * three Shippo rate options. The token is scoped to one request and expires in 14 days; any bad,
 * expired, revoked or tampered token renders the 404, never a partial page.
 *
 * Nothing is bought here. The rates are shown so the stylist can confirm the service and buy the
 * label from the studio side; the showroom never sees a price it is charged.
 */
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { shippoMode } from "@/lib/shippo"
import { formatIsoDate, formatMoney, formatDays } from "@/components/intake/format"
import { IntakeForm } from "@/components/intake/IntakeForm"
import { RateOptions } from "@/components/intake/RateOptions"
import {
  authorizeIntakeToken,
  intakeDefaults,
  isoDatePlusDays,
  parcelSummary,
  presentRates,
  studioAddressToShippo,
} from "@/server/queries/intake"
import { PICKUP_WINDOW_LABELS } from "@/components/intake/constants"
import styles from "@/components/intake/intake.module.css"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Pull — prepaid label request",
  // A bearer link must never end up in an index or a cache.
  robots: { index: false, follow: false, nocache: true },
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  sent: "Request sent",
  awaiting_label: "Awaiting label",
  label_sent: "Label sent",
  in_transit: "In transit",
  delivered: "Delivered",
  failed: "Failed",
}

export default async function IntakePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const ctx = await authorizeIntakeToken(token)
  if (!ctx) notFound()

  const { request, job, contact, shipment } = ctx
  const studio = studioAddressToShippo(ctx.stylist?.studioAddress ?? null)
  const defaults = intakeDefaults(contact, shipment)
  const pickup = (shipment?.intake?.pickup ?? {}) as Record<string, string>
  const rates = presentRates(shipment?.rates)
  const locked = Boolean(shipment?.labelUrl || shipment?.chosenRateId)
  const mode = shippoMode()

  const studioWarning =
    studio.missing.length > 0
      ? `The studio address is incomplete — missing ${studio.missing.join(", ")}. Rates cannot be quoted until the stylist adds it in the studio settings.`
      : null

  const existingRoute =
    pickup.city && studio.address?.city ? `${pickup.city} → ${studio.address.city}` : undefined
  const existingParcel = parcelSummary(shipment?.intake)

  return (
    <div className={styles.page}>
      <main className={styles.inner}>
        <header className={styles.top}>
          <span className="wordmark">PULL.</span>
          <span className={styles.topMeta}>Label request · Shippo</span>
        </header>

        <section className={styles.hero}>
          <p className="eyebrow">Pull · Label request</p>
          <h1 className={styles.heroTitle}>{request.brand} — prepaid label</h1>
          <p className={styles.heroLead}>
            We are arranging a prepaid label and the pickup for {job.clientName}&apos;s pull. Tell us
            the parcel and where to collect it — it takes about a minute.
          </p>

          <div className={styles.chips}>
            <span className="chip">For {job.clientName}</span>
            <span className="chip">{job.title}</span>
            <span className="chip">Return by {formatIsoDate(job.returnDate)}</span>
            <span className="chip">{STATUS_LABEL[request.status] ?? request.status}</span>
          </div>

          {studio.display ? (
            <p className={styles.shipTo}>
              Ship to <b>{studio.display}</b>
              {contact?.emails?.[0] ? ` · label to ${contact.emails[0]}` : ""}
            </p>
          ) : null}

          {studioWarning ? (
            <p className={styles.warning} role="alert">
              {studioWarning}
            </p>
          ) : null}
        </section>

        {locked && shipment ? (
          <section className={styles.lockedCard} aria-label="Label status">
            <div className="success">
              <span className="tick">✓</span>
              <h2 className="h3" style={{ margin: "12px 0 4px" }}>
                {shipment.labelUrl ? "Label created" : "Service selected"}
              </h2>
              <p className="small" style={{ margin: 0 }}>
                {shipment.labelUrl
                  ? "The prepaid label has been sent to the email on this request. Print it and hand the parcel to the courier."
                  : "Your stylist is preparing the label for this request."}
              </p>
            </div>

            <div className={styles.lockedGrid}>
              <span className={styles.labelKey}>Tracking</span>
              <span className={styles.labelValue}>{shipment.trackingNumber ?? "—"}</span>
              <span className={styles.labelKey}>Carrier</span>
              <span className={styles.labelValue}>
                {shipment.carrier ?? "—"}
                {shipment.service ? ` · ${shipment.service}` : ""}
              </span>
              <span className={styles.labelKey}>Parcel</span>
              <span className={styles.labelValue}>{existingParcel || "—"}</span>
              <span className={styles.labelKey}>Pickup</span>
              <span className={styles.labelValue}>
                {[pickup.street1, pickup.city, pickup.zip, pickup.country].filter(Boolean).join(", ") || "—"}
                {pickup.date ? ` · ${formatIsoDate(pickup.date)}` : ""}
                {pickup.window ? ` · ${PICKUP_WINDOW_LABELS[pickup.window] ?? pickup.window}` : ""}
              </span>
              {shipment.amountCents ? (
                <>
                  <span className={styles.labelKey}>Label cost</span>
                  <span className={styles.labelValue}>
                    {formatMoney(shipment.amountCents / 100, shipment.currency ?? "USD")}
                    {shipment.etaDays ? ` · ${formatDays(shipment.etaDays)}` : ""}
                  </span>
                </>
              ) : null}
            </div>

            {shipment.labelUrl ? (
              <p style={{ margin: "16px 0 0" }}>
                <a className="btn btn-ghost" href={shipment.labelUrl} target="_blank" rel="noreferrer">
                  Open the label PDF
                </a>
              </p>
            ) : null}

            <RateOptions
              rates={rates}
              mode={mode}
              routeSummary={existingRoute}
              parcelSummary={existingParcel}
            />
          </section>
        ) : (
          <IntakeForm
            token={token}
            defaults={defaults}
            existingRates={rates}
            existingMode={shipment ? mode : undefined}
            existingRoute={existingRoute}
            existingParcel={existingParcel}
            minPickupDate={isoDatePlusDays(0)}
            studioWarning={null}
          />
        )}

        <footer className={styles.foot}>
          <span>Pull · sample trafficking</span>
          <span>Labels by Shippo · this link expires 14 days after it was sent</span>
        </footer>
      </main>
    </div>
  )
}
