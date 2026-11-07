"use client"

/**
 * An agent run, playing out on the page.
 *
 * The screens would otherwise fill themselves instantly, which reads as fake: a
 * board that appears fully formed does not show that anything was done. This
 * walks the steps the agent takes — tool name, what it touched, how long —
 * and calls back as each one lands, so the content arrives with the work that
 * produced it. Olive marks the running step, because olive is the agent's.
 *
 * The step names are the ones the tracer actually writes — `agent.draft` per
 * brand, `resend.send` per email (`src/server/requests/drafts.ts`,
 * `src/server/actions/requests.ts`) — replayed here with their real order and
 * durations. Anything the app does not record is not shown as a step.
 */
import { useEffect, useRef, useState } from "react"
import Link from "next/link"

export interface AgentStep {
  tool: string
  note: string
  ms: number
}

export function AgentRun({
  steps,
  onStep,
  onDone,
  traceHref = "/trace",
}: {
  steps: AgentStep[]
  /** Called when a step finishes, with its index. */
  onStep?: (step: AgentStep, index: number) => void
  onDone?: () => void
  traceHref?: string
}) {
  const [done, setDone] = useState(0)
  const finished = useRef(false)
  const stepHandler = useRef(onStep)
  const doneHandler = useRef(onDone)
  stepHandler.current = onStep
  doneHandler.current = onDone

  useEffect(() => {
    if (done >= steps.length) {
      if (!finished.current) {
        finished.current = true
        doneHandler.current?.()
      }
      return
    }
    const timer = setTimeout(() => {
      stepHandler.current?.(steps[done], done)
      setDone((current) => current + 1)
    }, steps[done].ms)
    return () => clearTimeout(timer)
  }, [done, steps])

  return (
    <div className="mt-8 border-t border-border pt-4">
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-[11px] tracking-[0.02em] text-muted-foreground">
          Agent run · {Math.min(done, steps.length)}/{steps.length}
        </p>
        <Link
          href={traceHref}
          className="text-[11px] tracking-[0.02em] text-muted-foreground hover:text-foreground"
        >
          Open the trace
        </Link>
      </div>

      <ol className="mt-3 flex max-w-[760px] flex-col gap-2" aria-live="polite">
        {steps.map((step, index) => {
          const state = index < done ? "done" : index === done ? "running" : "waiting"
          return (
            <li key={`${step.tool}-${index}`} className="flex items-baseline gap-3 text-[11px]">
              <span
                aria-hidden
                className={`mt-0.5 size-1.5 shrink-0 rounded-full ${
                  state === "done"
                    ? "bg-success"
                    : state === "running"
                      ? "bg-brand motion-safe:animate-pulse"
                      : "bg-border"
                }`}
              />
              <span className="shrink-0 font-mono text-[11px] text-foreground">{step.tool}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{step.note}</span>
              <span className="shrink-0 font-mono text-[10px] tracking-[0.02em] text-muted-foreground-soft">
                {state === "done" ? `${step.ms}ms` : state === "running" ? "…" : ""}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
