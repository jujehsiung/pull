#!/usr/bin/env node
/**
 * prism:check — prove the Block Convey PRISM sink works before trusting it.
 *
 * Sends one trace with the same payload shape as src/lib/agent/prism.ts, then
 * asks PRISM's setup-doctor whether it is hearing us. Reads .env.local / .env
 * the way Next does; never prints the key.
 *
 *   npm run prism:check
 *
 * Exit 0 = connected. Exit 1 = not configured, or the ingest did not land.
 */
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    const path = resolve(process.cwd(), file)
    if (!existsSync(path)) continue
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!match) continue
      const [, key, rawValue] = match
      const value = rawValue.replace(/^["']|["']$/g, "").trim()
      if (value && !process.env[key]) process.env[key] = value
    }
  }
}

loadEnv()

const host = (process.env.PRISMTRACE_HOST ?? "").replace(/\/$/, "")
const projectId = process.env.PRISMTRACE_PROJECT_ID ?? ""
const apiKey = process.env.PRISMTRACE_API_KEY ?? ""

if (!host || !projectId || !apiKey) {
  console.error("prism:check — PRISMTRACE_HOST / _PROJECT_ID / _API_KEY not set; the sink is off.")
  process.exit(1)
}

const started = Date.now()
const ingest = await fetch(`${host}/api/traces`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-PRISMtrace-Key": apiKey },
  body: JSON.stringify({
    project_id: projectId,
    model: "prism-check",
    input_messages: [{ role: "user", content: "prism:check — does this land?" }],
    output_message: "yes",
    latency_ms: 1,
    session_id: "prism-check",
    agent_id: "pull",
    metadata: { kind: "prism-check" },
  }),
  signal: AbortSignal.timeout(10_000),
}).catch((error) => {
  console.error("prism:check — ingest failed:", error instanceof Error ? error.message : error)
  return null
})

if (!ingest) process.exit(1)

const body = await ingest.json().catch(() => ({}))
console.log(`ingest   ${ingest.status} ${ingest.ok ? "ok" : "FAILED"} · ${Date.now() - started}ms`)
if (body.id) console.log(`trace    ${body.id}`)
if (!ingest.ok) {
  console.error("prism:check — PRISM rejected the trace:", JSON.stringify(body.detail ?? body))
  process.exit(1)
}

const doctor = await fetch(`${host}/api/setup-doctor?project_id=${projectId}`, {
  headers: { "X-PRISMtrace-Key": apiKey },
  signal: AbortSignal.timeout(10_000),
}).catch(() => null)

if (!doctor || !doctor.ok) {
  console.warn("prism:check — trace landed, but setup-doctor was unavailable")
  process.exit(0)
}

const health = await doctor.json()
console.log(`health   ${health.overall} · live_connected=${health.live_connected}`)
for (const step of health.steps ?? []) {
  if (step.status !== "done") console.log(`  ${step.status.padEnd(8)} ${step.title}: ${step.detail ?? ""}`)
}
process.exit(health.overall === "connected" ? 0 : 1)
