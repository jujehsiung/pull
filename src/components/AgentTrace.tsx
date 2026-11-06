import { formatMs, summarise, type AgentStep } from "@/lib/agent/trace"

/**
 * The agent trace. Every tool call, in order, with its arguments, result, duration and status.
 * This is a hard product requirement (PRD §7.1, FR-23): the stylist must be able to see what
 * the agent did — not a spinner and a hope.
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
  const ok = steps.filter((s) => s.status === "ok").length
  const failed = steps.filter((s) => s.status === "error").length
  const total = steps.reduce((n, s) => n + (s.durationMs ?? 0), 0)

  return (
    <section
      className="card"
      style={{ padding: compact ? 16 : 22 }}
      aria-label={title}
      data-testid="agent-trace"
    >
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <p className="eyebrow">{title}</p>
        <span className="mono" style={{ fontSize: 10, letterSpacing: ".1em", color: "var(--muted-2)" }}>
          {steps.length} STEPS · {formatMs(total)} {failed ? `· ${failed} FAILED` : ""}
        </span>
      </div>

      <ol className="trace" style={{ marginTop: 16 }}>
        {steps.map((step) => (
          <li key={step.id} className={`trace-step ${step.status === "error" ? "error" : ""} ${step.status === "running" ? "running" : ""}`}>
            <div className="row" style={{ justifyContent: "space-between", gap: 12 }}>
              <span className="trace-tool">{step.tool}</span>
              <span className="trace-meta">
                {step.status === "running" ? "RUNNING" : step.status === "error" ? "ERROR" : "OK"} ·{" "}
                {formatMs(step.durationMs)}
              </span>
            </div>

            {(step.args !== undefined || step.result !== undefined || step.error) && !compact && (
              <details style={{ marginTop: 6 }}>
                <summary className="trace-meta" style={{ cursor: "pointer" }}>
                  {step.error ? step.error : summarise(step.result, 90)}
                </summary>
                {step.args !== undefined && (
                  <>
                    <p className="trace-meta" style={{ marginTop: 8 }}>INPUT</p>
                    <pre className="trace-io">{JSON.stringify(step.args, null, 2)}</pre>
                  </>
                )}
                {step.result !== undefined && (
                  <>
                    <p className="trace-meta" style={{ marginTop: 8 }}>OUTPUT</p>
                    <pre className="trace-io">{JSON.stringify(step.result, null, 2)}</pre>
                  </>
                )}
                {step.error && (
                  <>
                    <p className="trace-meta" style={{ marginTop: 8 }}>ERROR</p>
                    <pre className="trace-io" style={{ color: "var(--danger)" }}>{step.error}</pre>
                  </>
                )}
              </details>
            )}
          </li>
        ))}
      </ol>

      <p className="small" style={{ marginTop: 16, color: "var(--muted-2)" }}>
        {ok} ok{failed ? ` · ${failed} failed` : ""} — persisted per job, so it survives a refresh and is
        the audit trail for what the agent did.
      </p>
    </section>
  )
}
