/**
 * The PRISM widget — the same trace, in PRISM's dark instrument panel.
 *
 * PRISM (Block Convey) is the optional observability sink for the agent's model calls. Whether or
 * not the sink is configured, the run's trace is already here; this widget reads it the way PRISM
 * presents it: dark, mono, one row per call, duration and status first-class, the arguments behind
 * a disclosure. It is deliberately the one dark block on a light page — an instrument, not content.
 *
 * Tokens only: the dark lookbook material (`--dark*`) is a fixed palette in the theme, not a mode.
 */
import { formatMs, summarise, type AgentStep } from "@/lib/agent/trace"

function totalMs(steps: AgentStep[]): number {
  return steps.reduce((sum, step) => sum + (step.durationMs ?? 0), 0)
}

export function PrismTraceWidget({
  steps,
  title = "PRISM · trace mirror",
  sinkConfigured,
  provider,
}: {
  steps: AgentStep[]
  title?: string
  /** True when PRISMTRACE_HOST/PROJECT_ID/API_KEY are all set on this deployment. */
  sinkConfigured: boolean
  /** The active inference backend, e.g. "zoowork". */
  provider: string
}) {
  const failed = steps.filter((step) => step.status === "error").length

  return (
    <section
      aria-label={title}
      data-testid="prism-widget"
      style={{
        background: "var(--dark)",
        color: "var(--dark-text)",
        border: "1px solid var(--dark-line)",
        padding: "20px 20px 16px",
      }}
    >
      <header
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: "8px 16px",
          borderBottom: "1px solid var(--dark-line)",
          paddingBottom: 12,
        }}
      >
        <span className="mono" style={{ fontSize: 11, letterSpacing: ".02em", color: "var(--dark-muted)" }}>
          {title}
        </span>
        <span className="mono" style={{ fontSize: 10, letterSpacing: ".02em", color: "var(--dark-muted)" }}>
          {sinkConfigured ? "sink · configured" : "sink · not configured"} · provider {provider} ·{" "}
          {steps.length} calls · {formatMs(totalMs(steps))}
          {failed ? ` · ${failed} failed` : ""}
        </span>
      </header>

      <ol style={{ margin: "4px 0 0", padding: 0, listStyle: "none" }}>
        {steps.map((step) => (
          <li key={step.id} style={{ borderBottom: "1px solid var(--dark-line)", padding: "10px 0" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span
                aria-hidden
                style={{
                  width: 6,
                  height: 6,
                  flex: "none",
                  background: step.status === "error" ? "var(--dark-line)" : "var(--dark-ok)",
                  borderRadius: 0,
                  transform: "translateY(-2px)",
                }}
              />
              <span className="mono" style={{ fontSize: 12, color: "var(--dark-text)" }}>
                {step.tool}
              </span>
              <span className="mono" style={{ marginLeft: "auto", fontSize: 10, color: "var(--dark-muted)" }}>
                {formatMs(step.durationMs)}
              </span>
            </div>
            <details style={{ marginTop: 6 }}>
              <summary
                className="mono"
                style={{ cursor: "pointer", fontSize: 10, letterSpacing: ".02em", color: "var(--dark-muted)" }}
              >
                args · {summarise(step.args, 92)}
              </summary>
              <pre
                className="mono"
                style={{
                  margin: "8px 0 0",
                  padding: "10px 12px",
                  background: "var(--dark-2)",
                  border: "1px solid var(--dark-line)",
                  color: "var(--dark-text)",
                  fontSize: 10,
                  lineHeight: 1.55,
                  overflowX: "auto",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {JSON.stringify({ args: step.args, result: step.result, error: step.error }, null, 2)}
              </pre>
            </details>
          </li>
        ))}
      </ol>

      <p
        className="mono"
        style={{ margin: "12px 0 0", fontSize: 10, letterSpacing: ".02em", color: "var(--dark-muted)" }}
      >
        PRISM mirrors the run when PRISMTRACE_HOST · PRISMTRACE_PROJECT_ID · PRISMTRACE_API_KEY are set.
      </p>
    </section>
  )
}
