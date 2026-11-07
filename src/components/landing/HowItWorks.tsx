"use client"

/**
 * How it works — the three moves, with the screens moving.
 *
 * The screen is the explanation, so it is not a static illustration: each step
 * advances the frame, held long enough to read and pausable on hover or focus.
 * A hairline progress rule under the frame keeps the timing honest. Under
 * `prefers-reduced-motion` nothing advances on its own — the steps are still
 * clickable, and the first screen simply sits there.
 */
import { useEffect, useRef, useState } from "react"
import Image from "next/image"

export interface HowStep {
  n: string
  title: string
  body: string
  label: string
  screen: string
  alt: string
}

const HOLD_MS = 5600

export function HowItWorks({ steps }: { steps: HowStep[] }) {
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  const [reduced, setReduced] = useState(false)
  const frame = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches)
  }, [])

  useEffect(() => {
    if (paused || reduced) return
    const timer = setTimeout(() => setActive((current) => (current + 1) % steps.length), HOLD_MS)
    return () => clearTimeout(timer)
  }, [active, paused, reduced, steps.length])

  const step = steps[active]

  return (
    <div className="mt-8 grid gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1.45fr)] md:gap-14">
      {/* The three moves — one is open. */}
      <ol
        className="flex flex-col border-t border-border"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
      >
        {steps.map((item, index) => {
          const isActive = index === active
          return (
            <li key={item.n} className="border-b border-border">
              <button
                type="button"
                onClick={() => setActive(index)}
                aria-pressed={isActive}
                className="flex w-full flex-col items-start gap-2 py-5 text-left"
              >
                <span
                  className={`font-mono text-[11px] tracking-[0.02em] ${
                    isActive ? "text-brand" : "text-muted-foreground-soft"
                  }`}
                >
                  {item.n}
                </span>
                <span
                  className={`text-[20px] font-medium leading-tight tracking-[-0.01em] ${
                    isActive ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {item.title}
                </span>
                <span
                  className={`max-w-[40ch] text-[14px] leading-relaxed ${
                    isActive ? "text-muted-foreground" : "text-muted-foreground-soft"
                  }`}
                >
                  {item.body}
                </span>
              </button>
            </li>
          )
        })}
      </ol>

      {/* The screens. */}
      <figure
        className="m-0 self-start"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <div
          ref={frame}
          className="relative aspect-[1440/930] overflow-hidden border border-border bg-muted"
        >
          {steps.map((item, index) => (
            <Image
              key={item.screen}
              src={item.screen}
              alt={item.alt}
              width={1440}
              height={930}
              priority={index === 0}
              sizes="(min-width: 768px) 780px, 100vw"
              className={`absolute inset-0 h-full w-full object-cover object-top transition-opacity duration-700 ${
                index === active ? "opacity-100" : "opacity-0"
              }`}
            />
          ))}
        </div>

        {/* The timing, as a hairline. */}
        <div className="mt-2 h-px w-full overflow-hidden bg-border" aria-hidden>
          <div
            key={reduced ? "static" : `${active}-${paused ? "paused" : "run"}`}
            className={`h-px w-full origin-left bg-foreground ${reduced ? "" : "reel-progress"}`}
            style={{
              animationDuration: `${HOLD_MS}ms`,
              animationPlayState: paused ? "paused" : undefined,
              transform: reduced ? "scaleX(1)" : undefined,
            }}
          />
        </div>

        <figcaption className="mt-3 flex items-baseline justify-between gap-4 text-[11px] tracking-[0.02em] text-muted-foreground">
          <span>{step.label}</span>
          <span className="font-mono">{`${step.n} / 03`}</span>
        </figcaption>
      </figure>
    </div>
  )
}
