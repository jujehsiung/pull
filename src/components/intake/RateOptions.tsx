/**
 * The three rate options for the showroom intake (FR-18).
 *
 * Presentational only, deliberately: the showroom can see carrier, service, transit days and price,
 * but choosing/paying belongs to the stylist on the studio side. The tags ("cheapest", "fastest")
 * are computed against the full rate list, not just the three shown.
 */
import type { IntakeRateOption } from "@/server/queries/intake"
import { formatDays, formatMoney } from "./format"
import styles from "./intake.module.css"

export function RateOptions({
  rates,
  mode,
  routeSummary,
  parcelSummary,
}: {
  rates: IntakeRateOption[]
  mode?: string
  routeSummary?: string
  parcelSummary?: string
}) {
  if (rates.length === 0) return null

  return (
    <section className={styles.ratesCard} aria-label="Shipping options" id="rates">
      <div className={styles.ratesHead}>
        <div>
          <p className="eyebrow">SHIPPO · {mode === "test" ? "TEST RATES" : "LIVE RATES"}</p>
          <h2 className="h3" style={{ margin: "8px 0 2px" }}>
            {rates.length === 1 ? "1 service" : `${rates.length} services`}
          </h2>
          <p className="small">
            {[routeSummary, parcelSummary].filter(Boolean).join(" · ") || "Rates for the parcel above"}
          </p>
        </div>
        {mode ? <span className="chip">{mode === "test" ? "TEST MODE" : "LIVE"}</span> : null}
      </div>

      <ul className={styles.rateList}>
        {rates.map((rate) => (
          <li key={rate.id} className="rate-option">
            <div className="rate-main">
              <div className="rate-name">{rate.carrier}</div>
              <div className="rate-meta">
                {rate.service} · {formatDays(rate.days)} · tracked
              </div>
              {rate.tags.length > 0 ? (
                <div className={styles.tags}>
                  {rate.tags.map((tag) => (
                    <span
                      key={tag}
                      className={`${styles.tag} ${tag === "cheapest" ? styles.tagCheapest : ""}`}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="rate-price">{formatMoney(rate.amount, rate.currency)}</div>
          </li>
        ))}
      </ul>

      <p className="small" style={{ marginTop: 14 }}>
        Quoting is free — no label has been bought. Your stylist confirms the service and sends the
        prepaid label to the email on this request.
      </p>
    </section>
  )
}
