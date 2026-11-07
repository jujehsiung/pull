/**
 * Which agent backend is live — shown in the studio chrome and on /trace.
 *
 * This is not decoration. The hackathon's first judging gate is binary ("runs on
 * ZooWork Managed Agents"), so the running surface has to state its own backend
 * without anyone opening a terminal. Today it reads DeepSeek; the afternoon the
 * ZOOWORK_API_KEY lands it flips to ZooWork with no code change.
 *
 * Server component — reads env through agentStatus(), never imported client-side.
 */
import { agentStatus } from "@/lib/agent"

const LABELS: Record<string, string> = {
  zoowork: "ZooWork · Managed Agents",
  deepseek: "DeepSeek Platform",
  deterministic: "Deterministic fallback",
}

/** Status colour, never used as body text. */
const DOTS: Record<string, string> = {
  zoowork: "var(--success)",
  deepseek: "var(--brand)",
  deterministic: "var(--muted-foreground-soft)",
}

export function AgentProviderBadge({ hint }: { hint?: string }) {
  const status = agentStatus()
  const active = status.active
  // A forced backend with no credentials is running the fallback: say so
  // instead of showing the backend that was asked for.
  const warning = status.warning
  const model =
    active === "zoowork"
      ? status.zoowork.model
      : active === "deepseek"
        ? status.deepseek.model
        : "no model"

  return (
    <span
      title={warning ?? hint ?? `AGENT_PROVIDER=${status.forced ?? "auto"} · swap with npm run agent:swap`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        height: 26,
        padding: "0 10px 0 8px",
        border: "1px solid var(--line)",
        borderRadius: 999,
        background: "var(--card)",
        whiteSpace: "nowrap",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: warning ? "var(--warning)" : (DOTS[active] ?? DOTS.deterministic),
          flex: "none",
        }}
      />
      <span
        className="mono"
        style={{
          fontSize: 10,
          letterSpacing: ".1em",
          textTransform: "uppercase",
          color: "var(--ink-2)",
        }}
      >
        {LABELS[active] ?? active}
      </span>
      <span
        className="mono"
        style={{
          fontSize: 10,
          color: warning ? "var(--warning)" : "var(--muted-foreground-soft)",
          borderLeft: "1px solid var(--line)",
          paddingLeft: 8,
        }}
      >
        {warning ? `forced: ${status.forced}` : model}
      </span>
    </span>
  )
}
