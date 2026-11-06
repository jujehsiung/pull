/** Shared shape for the intake form's action state (client form ← server action). */
import type { IntakeRateOption } from "@/server/queries/intake"

export interface IntakeFormState {
  status: "idle" | "error" | "rated"
  /** Human-readable reason shown in the form; Shippo's own text is kept verbatim. */
  error?: string
  /** The three presented options after a successful rate call. */
  presented?: IntakeRateOption[]
  shipmentId?: string
  parcelSummary?: string
  routeSummary?: string
  mode?: string
  messages?: string[]
}

export const initialIntakeState: IntakeFormState = { status: "idle" }
