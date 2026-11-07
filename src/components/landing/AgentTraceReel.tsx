"use client"

/**
 * The landing's agent trace, played back.
 *
 * It behaves like the real thing rather than like a finished list: the run
 * advances one step at a time, the step in flight carries the agent's olive dot,
 * and each duration appears when that call returns — because in the product the
 * duration is only known afterwards. A counter keeps the score, and the whole
 * thing starts when it scrolls into view, holds for a beat, and runs again.
 *
 * Under `prefers-reduced-motion` it is a finished trace on load: no timers, no
 * pulse, every duration shown.
 */
import { useEffect, useRef, useState } from "react"
import Link from "next/link"

export interface TraceRow {
  tool: string
  note: string
  ms: number
}

/** The real durations, compressed so the whole run reads in a few seconds. */
function runMs(ms: number): number {
  return Math.min(1300, Math.max(420, ms))
}

const HOLD_MS = 2600

export function AgentTraceReel({ rows, href = "/trace" }: { rows: TraceRow[]; href?: string }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [inView, setInView] = useState(false)
  const [reduced, setReduced] = useState(false)
  const [completed, setCompleted] = useState(0)

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches)
  }, [])

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.4 },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!inView || reduced) return
    if (completed >= rows.length) {
      const hold = setTimeout(() => setCompleted(0), HOLD_MS)
      return () => clearTimeout(hold)
    }
    const step = setTimeout(() => setCompleted((current) => current + 1), runMs(rows[completed].ms))
    return () => clearTimeout(step)
  }, [completed, inView, reduced, rows])

  const running = inView && !reduced && completed < rows.length ? completed : -1
  const shown = reduced ? rows.length : completed

  return (
    <div ref={ref} className="flex flex-col">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-border pt-3">
        <span className="text-[11px] tracking-[0.02em] text-muted-foreground">
          Agent run · {shown}/{rows.length}
        </span>
        <Link
          href={href}
          className="text-[11px] tracking-[0.02em] text-foreground underline-offset-4 hover:underline"
        >
          Open the trace →
        </Link>
      </div>

      <ol className="mt-1 flex flex-col" aria-label="Agent run sample">
        {rows.map((row, index) => {
          const status: "done" | "running" | "queued" =
            reduced || index < completed ? "done" : index === running ? "running" : "queued"

          return (
            <li
              key={row.tool}
              className={`flex items-baseline gap-3 border-b border-border py-2.5 text-[11px] transition-opacity duration-500 ${
                status === "queued" ? "opacity-40" : "opacity-100"
              }`}
            >
              <span
                aria-hidden
                className={`size-1.5 shrink-0 rounded-full ${
                  status === "done"
                    ? "bg-success"
                    : status === "running"
                      ? "bg-brand motion-safe:animate-pulse"
                      : "bg-border"
                }`}
              />
              <span
                className={`shrink-0 font-mono text-[11px] ${
                  status === "queued" ? "text-muted-foreground" : "text-foreground"
                }`}
              >
                {row.tool}
              </span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{row.note}</span>
              <span className="min-w-[64px] shrink-0 text-right font-mono text-[10px] tracking-[0.02em] text-muted-foreground-soft tabular-nums">
                {status === "done" ? (
                  <span className="motion-safe:animate-[fade-in_240ms_ease-out]">
                    {row.ms.toLocaleString("en-US")}ms
                  </span>
                ) : status === "running" ? (
                  <span className="text-brand">running</span>
                ) : (
                  ""
                )}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
