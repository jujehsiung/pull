/**
 * Fixed-window rate limiter for the public links (PRD §13: public endpoints 30 req/min/IP).
 *
 * In-memory and per-process on purpose: this is a demo running as one Node process, and a shared
 * Redis would be infrastructure the demo does not have. The tradeooff is honest — a restart clears
 * the counters, and behind multiple instances each would count separately. Note it in DEMO.md.
 *
 * Keys are caller-defined (`client:1.2.3.4`, `intake:1.2.3.4`), so the client board and the showroom
 * intake never share a budget.
 */
export interface RateLimitResult {
  ok: boolean
  remaining: number
  limit: number
  resetAt: number
  retryAfterSeconds: number
}

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()
let lastSweep = 0

/** Drop expired buckets now and then so a long-running process cannot grow without bound. */
function sweep(now: number): void {
  if (now - lastSweep < 60_000) return
  lastSweep = now
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}

export function take(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
  sweep(now)
  const existing = buckets.get(key)
  if (!existing || existing.resetAt <= now) {
    const bucket = { count: 1, resetAt: now + windowMs }
    buckets.set(key, bucket)
    return { ok: true, remaining: limit - 1, limit, resetAt: bucket.resetAt, retryAfterSeconds: 0 }
  }
  existing.count += 1
  const ok = existing.count <= limit
  return {
    ok,
    remaining: Math.max(0, limit - existing.count),
    limit,
    resetAt: existing.resetAt,
    retryAfterSeconds: ok ? 0 : Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  }
}

/** Test/debug helper — not used by the app. */
export function resetRateLimits(): void {
  buckets.clear()
  lastSweep = 0
}
