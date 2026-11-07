/**
 * Mirror model calls to Block Convey PRISM — observability, not inference.
 *
 * PRISM is not a provider: it stores exchanges (prompt, output, model, latency),
 * groups them into sessions and runs, and scores them. So every call that goes
 * through `runAgentTask` sends one trace here, keyed by the job so a board's
 * drafting reads as one trajectory in their dashboard.
 *
 * Three rules, from their docs and ours:
 *   - delivery is never in the request path: fire and forget, 5s timeout, never throws;
 *   - it is off unless `PRISMTRACE_*` is configured, so the app runs unchanged without an account;
 *   - the prompt travels: client names and showroom addresses leave the machine when this is on.
 *
 * The in-app trace stays the source of truth (`events` → /trace). PRISM is a mirror.
 */
import { env } from "@/lib/env"

export interface PrismExchange {
  model: string
  system?: string
  user: string
  output: string
  latencyMs: number
  /** One value per job, so a drafting run reads as one session. */
  sessionId?: string
  error?: string
  metadata?: Record<string, unknown>
}

export function prismConfigured(): boolean {
  const config = env()
  return Boolean(config.PRISMTRACE_HOST && config.PRISMTRACE_PROJECT_ID && config.PRISMTRACE_API_KEY)
}

export function emitPrismExchange(exchange: PrismExchange): void {
  const config = env()
  if (!config.PRISMTRACE_HOST || !config.PRISMTRACE_PROJECT_ID || !config.PRISMTRACE_API_KEY) return

  const input = [
    ...(exchange.system ? [{ role: "system", content: exchange.system }] : []),
    { role: "user", content: exchange.user },
  ]

  void fetch(`${config.PRISMTRACE_HOST.replace(/\/$/, "")}/api/traces`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-PRISMtrace-Key": config.PRISMTRACE_API_KEY,
    },
    body: JSON.stringify({
      project_id: config.PRISMTRACE_PROJECT_ID,
      model: exchange.model,
      input_messages: input,
      output_message: exchange.error ? "" : exchange.output,
      latency_ms: Math.max(0, Math.round(exchange.latencyMs)),
      session_id: exchange.sessionId ?? "pull-unattributed",
      agent_id: "pull",
      metadata: {
        ...exchange.metadata,
        ...(exchange.error ? { error: exchange.error } : {}),
      },
    }),
    signal: AbortSignal.timeout(5000),
  })
    .then((res) => {
      if (!res.ok) console.warn(`prism ingest ${res.status}`)
    })
    .catch((err: unknown) => {
      console.warn("prism ingest failed", err instanceof Error ? err.message : err)
    })
}
