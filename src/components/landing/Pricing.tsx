"use client"

/**
 * Plans — seats, priced per stylist.
 *
 * Prices here are provisional: the shape is settled (Clerk accounts + a Stripe
 * seat subscription), the numbers are a proposal for the founder to confirm
 * before this page ships. Annual is two months free.
 */
import { useState } from "react"
import { Check } from "lucide-react"

import { StartJobFlow } from "@/components/start-job/StartJobFlow"

interface Plan {
  id: string
  name: string
  blurb: string
  monthly: number | null
  annual: number | null
  /** What one seat buys, said plainly. */
  seats: string
  features: string[]
  cta: "start" | "talk"
}

const PLANS: Plan[] = [
  {
    id: "solo",
    name: "Solo",
    blurb: "One stylist, every job.",
    monthly: 29,
    annual: 24,
    seats: "1 seat",
    features: [
      "One seat — the stylist who signs in",
      "Unlimited jobs and looks",
      "Client links: approve, pass, circle",
      "Agent-drafted request emails",
    ],
    cta: "start",
  },
  {
    id: "studio",
    name: "Studio",
    blurb: "The studio, with the shipping.",
    monthly: 59,
    annual: 49,
    seats: "per seat",
    features: [
      "Everything in Solo",
      "Showroom links, parcel sizes and labels",
      "The contacts book, with agent matching",
      "Priority agent runs",
    ],
    cta: "start",
  },
  {
    id: "house",
    name: "House",
    blurb: "For teams that hand it around.",
    monthly: null,
    annual: null,
    seats: "custom",
    features: [
      "Everything in Studio",
      "Single sign-on",
      "Onboarding and team training",
      "A named person to call",
    ],
    cta: "talk",
  },
]

export function Pricing() {
  const [annual, setAnnual] = useState(false)

  return (
    <div>
      <div className="mt-8 flex flex-wrap items-baseline justify-between gap-4 border-b border-border pb-3">
        <div className="flex items-baseline gap-4">
          <button
            type="button"
            onClick={() => setAnnual(false)}
            aria-pressed={!annual}
            className={`border-b pb-0.5 text-[11px] tracking-[0.02em] ${
              annual ? "border-transparent text-muted-foreground" : "border-foreground text-foreground"
            }`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setAnnual(true)}
            aria-pressed={annual}
            className={`border-b pb-0.5 text-[11px] tracking-[0.02em] ${
              annual ? "border-foreground text-foreground" : "border-transparent text-muted-foreground"
            }`}
          >
            Annual · two months free
          </button>
        </div>
        <p className="text-[11px] tracking-[0.02em] text-muted-foreground">
          Priced per seat. Clients and showrooms never take one.
        </p>
      </div>

      <div className="mt-8 grid gap-10 md:grid-cols-3 md:gap-8">
        {PLANS.map((plan) => {
          const price = annual ? plan.annual : plan.monthly
          return (
            <div key={plan.id} className="flex h-full flex-col border-t border-border pt-5">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-[20px] font-medium leading-none tracking-[-0.01em] text-foreground">
                  {plan.name}
                </h3>
                <span className="text-[11px] tracking-[0.02em] text-muted-foreground-soft">
                  {plan.seats}
                </span>
              </div>

              <p className="mt-2 text-[13px] text-muted-foreground">{plan.blurb}</p>

              <p className="mt-6 flex items-baseline gap-1.5">
                <span className="text-[clamp(34px,3.6vw,46px)] font-semibold leading-none tracking-[-0.03em] text-foreground">
                  {price === null ? "Talk to us" : `$${price}`}
                </span>
                {price !== null ? (
                  <span className="text-[11px] tracking-[0.02em] text-muted-foreground">
                    / seat / month{annual ? ", billed yearly" : ""}
                  </span>
                ) : null}
              </p>

              <ul className="mt-6 flex flex-col gap-2">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-[13px] text-foreground">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-brand" aria-hidden />
                    <span className="text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-auto pt-8">
                {plan.cta === "start" ? (
                  <StartJobFlow kind="nav" />
                ) : (
                  <a className="btn btn-ghost btn-sm" href="mailto:hello@muen.studio">
                    Talk to us
                  </a>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
