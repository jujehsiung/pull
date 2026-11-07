"use client"

import { useEffect, useRef, useState } from "react"

import { AgentTrace } from "@/components/AgentTrace"
import { Button } from "@/components/ui/button"
import type { AgentStep } from "@/lib/agent/trace"

/**
 * Live trace: server-rendered first, then polled while the panel is on screen. Stops polling after
 * a couple of quiet minutes so a forgotten tab does not hammer the route.
 */
export function TracePanel({ jobId, initialSteps }: { jobId: string; initialSteps: AgentStep[] }) {
  const [steps, setSteps] = useState<AgentStep[]>(initialSteps)
  const [live, setLive] = useState(true)
  const quiet = useRef(0)

  useEffect(() => {
    if (!live) return
    let cancelled = false

    const tick = async () => {
      try {
        const res = await fetch(`/api/studio/trace?jobId=${encodeURIComponent(jobId)}`, { cache: "no-store" })
        if (!res.ok) return
        const data = (await res.json()) as { steps: AgentStep[] }
        if (cancelled) return
        setSteps((prev) => {
          if (data.steps.length === prev.length && data.steps.at(-1)?.id === prev.at(-1)?.id) {
            quiet.current += 1
            return prev
          }
          quiet.current = 0
          return data.steps
        })
        if (quiet.current > 80) setLive(false)
      } catch {
        /* offline: keep the last trace, do not blank the panel */
      }
    }

    const id = setInterval(tick, 1500)
    void tick()
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [jobId, live])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <span
          className={`inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.02em] ${
            live ? "text-success" : "text-muted-foreground-soft"
          }`}
        >
          <span
            aria-hidden
            className={`size-1.5 rounded-full ${live ? "bg-success motion-safe:animate-pulse" : "bg-border"}`}
          />
          {live ? "Live" : "Paused"}
        </span>
        <Button variant="outline" size="sm" onClick={() => setLive((value) => !value)}>
          {live ? "Pause" : "Resume"}
        </Button>
      </div>
      <AgentTrace steps={steps} title="Agent trace" />
    </div>
  )
}
