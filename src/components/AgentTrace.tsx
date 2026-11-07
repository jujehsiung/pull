import { formatMs, summarise, type AgentStep } from "@/lib/agent/trace"

/**
 * The agent trace. Every tool call, in order, with its arguments, result, duration and status.
 * This is a hard product requirement (PRD §7.1, FR-23): the stylist must be able to see what
 * the agent did — not a spinner and a hope.
 *
 * Design: hairline rows, mono tool names, one status dot. The row is the unit; the arguments sit
 * behind a native `<details>` so the list stays scannable.
 */
export function AgentTrace({
  steps,
  title = "Agent trace",
  compact = false,
}: {
  steps: AgentStep[]
  title?: string
  compact?: boolean
}) {
  const ok = steps.filter((step) => step.status === "ok").length
  const failed = steps.filter((step) => step.status === "error").length
  const total = steps.reduce((sum, step) => sum + (step.durationMs ?? 0), 0)

  return (
    <section
      aria-label={title}
      data-testid="agent-trace"
      className={compact ? "border-t border-border pt-4" : "border-t border-border pt-5"}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-[11px] tracking-[0.02em] text-muted-foreground">{title}</p>
        <span className="font-mono text-[10px] tracking-[0.02em] text-muted-foreground-soft">
          {steps.length} steps · {formatMs(total)}
          {failed ? ` · ${failed} failed` : ""}
        </span>
      </div>

      <ol className="mt-4 flex flex-col">
        {steps.map((step) => (
          <li key={step.id} className="border-t border-border py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="inline-flex items-baseline gap-2 font-mono text-[12px] text-foreground">
                <span
                  aria-hidden
                  className={`size-1.5 shrink-0 rounded-full ${
                    step.status === "error"
                      ? "bg-destructive"
                      : step.status === "running"
                        ? "bg-brand motion-safe:animate-pulse"
                        : "bg-success"
                  }`}
                />
                {step.tool}
              </span>
              <span className="font-mono text-[10px] tracking-[0.02em] text-muted-foreground-soft">
                {step.status === "running" ? "Running" : step.status === "error" ? "Error" : "OK"} ·{" "}
                {formatMs(step.durationMs)}
              </span>
            </div>

            {(step.args !== undefined || step.result !== undefined || step.error) && !compact ? (
              <details className="mt-2">
                <summary className="cursor-pointer text-[11px] tracking-[0.02em] text-muted-foreground">
                  {step.error ? step.error : summarise(step.result, 90)}
                </summary>
                {step.args !== undefined ? (
                  <>
                    <p className="mt-2 text-[10px] tracking-[0.12em] text-muted-foreground-soft">Input</p>
                    <pre className="mt-1 max-h-[220px] overflow-auto border border-border bg-muted p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-foreground">
                      {JSON.stringify(step.args, null, 2)}
                    </pre>
                  </>
                ) : null}
                {step.result !== undefined ? (
                  <>
                    <p className="mt-2 text-[10px] tracking-[0.12em] text-muted-foreground-soft">Output</p>
                    <pre className="mt-1 max-h-[220px] overflow-auto border border-border bg-muted p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-foreground">
                      {JSON.stringify(step.result, null, 2)}
                    </pre>
                  </>
                ) : null}
                {step.error ? (
                  <>
                    <p className="mt-2 text-[10px] tracking-[0.12em] text-muted-foreground-soft">Error</p>
                    <pre className="mt-1 max-h-[220px] overflow-auto border border-border bg-muted p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-destructive">
                      {step.error}
                    </pre>
                  </>
                ) : null}
              </details>
            ) : null}
          </li>
        ))}
      </ol>

      <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground-soft">
        {ok} ok{failed ? ` · ${failed} failed` : ""} — persisted per job, so it survives a refresh and
        is the audit trail for what the agent did.
      </p>
    </section>
  )
}
