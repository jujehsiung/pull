"use client"

/**
 * The showroom intake form (FR-17): parcel, pickup address and contact in one page, mobile-first.
 *
 * Native HTML constraints catch the obvious mistakes while typing; the server action is the
 * authority and returns either the three Shippo rates or a human-readable error with Shippo's own
 * text kept verbatim. Values stay in the (uncontrolled) inputs across a failed attempt, so a retry
 * after a carrier error does not mean retyping the whole form.
 *
 * `useActionState` keeps this no-account page usable on a phone with or without JavaScript.
 */
import { useActionState } from "react"
import type { IntakeDefaults } from "@/server/queries/intake"
import { submitIntake } from "@/server/actions/intake"
import { COUNTRY_OPTIONS, PICKUP_WINDOWS, PICKUP_WINDOW_LABELS } from "./constants"
import type { IntakeRateOption } from "@/server/queries/intake"
import { RateOptions } from "./RateOptions"
import { initialIntakeState } from "./types"
import styles from "./intake.module.css"

export interface IntakeFormProps {
  token: string
  defaults: IntakeDefaults
  existingRates: IntakeRateOption[]
  existingMode?: string
  existingRoute?: string
  existingParcel?: string
  minPickupDate: string
  studioWarning?: string | null
}

export function IntakeForm({
  token,
  defaults,
  existingRates,
  existingMode,
  existingRoute,
  existingParcel,
  minPickupDate,
  studioWarning,
}: IntakeFormProps) {
  const [state, formAction, pending] = useActionState(submitIntake, initialIntakeState)

  const rateState = state.status === "rated"
  const rates = rateState ? state.presented ?? [] : existingRates
  const mode = rateState ? state.mode : existingMode
  const routeSummary = rateState ? state.routeSummary : existingRoute
  const parcelSummary = rateState ? state.parcelSummary : existingParcel
  const error = state.status === "error" ? state.error : null
  const countries = Array.from(new Set([defaults.country, ...COUNTRY_OPTIONS])).filter(Boolean)

  return (
    <>
      <form className="intake-card" action={formAction} aria-describedby="intake-hint" aria-busy={pending}>
        <input type="hidden" name="token" value={token} />

        <h2 className="h3" style={{ margin: "0 0 4px" }}>
          1 · The parcel
        </h2>
        <p className="small" style={{ marginBottom: 14 }}>
          Approximate is fine — the courier rounds up.
        </p>
        <div className="field-grid">
          <div className="field">
            <label htmlFor="length">Length (cm)</label>
            <input
              id="length"
              name="length"
              type="number"
              inputMode="numeric"
              min={5}
              max={200}
              step={1}
              required
              defaultValue={defaults.length}
            />
          </div>
          <div className="field">
            <label htmlFor="width">Width (cm)</label>
            <input
              id="width"
              name="width"
              type="number"
              inputMode="numeric"
              min={5}
              max={200}
              step={1}
              required
              defaultValue={defaults.width}
            />
          </div>
          <div className="field">
            <label htmlFor="height">Height (cm)</label>
            <input
              id="height"
              name="height"
              type="number"
              inputMode="numeric"
              min={5}
              max={200}
              step={1}
              required
              defaultValue={defaults.height}
            />
          </div>
          <div className="field">
            <label htmlFor="weightKg">Weight (kg)</label>
            <input
              id="weightKg"
              name="weightKg"
              type="number"
              inputMode="decimal"
              min={0.05}
              max={50}
              // step is measured FROM min, so step={0.1} made the valid grid 0.05, 0.15, 0.25 …
              // and every natural weight (1.0, 1.2, 2.4) failed native validation before the form
              // could post. Found by the M4 E2E: the demo's own default 1.2 was rejected by the
              // browser with "the two nearest valid values are 1.15 and 1.25". 0.05 keeps 50 g
              // granularity and makes 1.2 = 0.05 + 23 × 0.05 valid.
              step={0.05}
              required
              defaultValue={defaults.weightKg}
            />
          </div>
        </div>

        <h2 className="h3" style={{ margin: "26px 0 4px" }}>
          2 · Pickup
        </h2>
        <p className="small" style={{ marginBottom: 14 }}>
          Where the courier should collect it.
        </p>
        <div className="field-grid">
          <div className="field full">
            <label htmlFor="street1">Street address</label>
            <input
              id="street1"
              name="street1"
              autoComplete="address-line1"
              required
              maxLength={120}
              defaultValue={defaults.street1}
            />
          </div>
          <div className="field full">
            <label htmlFor="street2">
              Building, floor, entrance <span className={styles.optional}>(optional)</span>
            </label>
            <input
              id="street2"
              name="street2"
              autoComplete="address-line2"
              maxLength={120}
              defaultValue={defaults.street2}
            />
          </div>
          <div className="field">
            <label htmlFor="city">City</label>
            <input id="city" name="city" autoComplete="address-level2" required maxLength={60} defaultValue={defaults.city} />
          </div>
          <div className="field">
            <label htmlFor="state">State / region</label>
            <input
              id="state"
              name="state"
              autoComplete="address-level1"
              maxLength={60}
              defaultValue={defaults.state}
            />
          </div>
          <div className="field">
            <label htmlFor="zip">Postcode / ZIP</label>
            <input
              id="zip"
              name="zip"
              autoComplete="postal-code"
              required
              maxLength={12}
              pattern="[A-Za-z0-9][A-Za-z0-9 \-]{2,11}"
              title="Letters, numbers, spaces or hyphens"
              defaultValue={defaults.zip}
            />
          </div>
          <div className="field">
            <label htmlFor="country">Country</label>
            <select id="country" name="country" required defaultValue={defaults.country}>
              {countries.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="name">Contact name</label>
            <input
              id="name"
              name="name"
              autoComplete="name"
              required
              minLength={2}
              maxLength={80}
              defaultValue={defaults.name}
            />
          </div>
          <div className="field">
            <label htmlFor="phone">Phone</label>
            <input
              id="phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              required
              minLength={7}
              maxLength={25}
              defaultValue={defaults.phone}
            />
          </div>
          <div className="field">
            <label htmlFor="email">
              Email <span className={styles.optional}>(optional)</span>
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              maxLength={120}
              defaultValue={defaults.email}
            />
          </div>
          <div className="field">
            <label htmlFor="pickupDate">Pickup date</label>
            <input
              id="pickupDate"
              name="pickupDate"
              type="date"
              required
              min={minPickupDate}
              defaultValue={defaults.pickupDate}
            />
          </div>
          <div className="field">
            <label htmlFor="pickupWindow">Pickup window</label>
            <select id="pickupWindow" name="pickupWindow" required defaultValue={defaults.pickupWindow}>
              {PICKUP_WINDOWS.map((window) => (
                <option key={window} value={window}>
                  {PICKUP_WINDOW_LABELS[window] ?? window}
                </option>
              ))}
            </select>
          </div>
        </div>

        {studioWarning ? (
          <p className={styles.warning} role="alert">
            {studioWarning}
          </p>
        ) : null}

        {error ? (
          <div role="alert" className={styles.error}>
            <p className={styles.errorTitle}>The rates did not come back</p>
            <p className={styles.errorText}>{error}</p>
            <p className={styles.errorText}>
              Nothing was saved. Fix anything above and press the button again.
            </p>
          </div>
        ) : null}

        <button
          type="submit"
          className="btn btn-primary"
          disabled={pending}
          style={{ marginTop: 22, width: "100%", minHeight: 46 }}
        >
          {pending ? "Getting rates…" : rates.length > 0 ? "Get rates again" : "See shipping options"}
        </button>
        <p id="intake-hint" className="small" style={{ marginTop: 10, color: "var(--muted-2)" }}>
          No account needed. We only use this to price the label — nothing is bought or charged here.
        </p>
      </form>

      {rates.length > 0 ? (
        <RateOptions
          rates={rates}
          mode={mode}
          routeSummary={routeSummary}
          parcelSummary={parcelSummary}
        />
      ) : null}
    </>
  )
}
