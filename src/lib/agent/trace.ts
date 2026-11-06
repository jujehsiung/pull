/** Shared shape for the agent trace — used by the server tracer and the UI. */
export type TraceStatus = "ok" | "error" | "running"

export interface AgentStep {
  id: string
  /** Tool name as it appears in the trace, e.g. "cloudinary.trim". */
  tool: string
  status: TraceStatus
  args?: unknown
  result?: unknown
  error?: string
  durationMs?: number
  at: string
}

export function summarise(value: unknown, max = 120): string {
  if (value === undefined) return ""
  if (typeof value === "string") return value.length > max ? `${value.slice(0, max)}…` : value
  try {
    const json = JSON.stringify(value)
    return json.length > max ? `${json.slice(0, max)}…` : json
  } catch {
    return "[unserialisable]"
  }
}

export function formatMs(ms?: number): string {
  if (ms === undefined) return ""
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`
}
