#!/usr/bin/env node
/**
 * Agent inference check. Read-only — it never creates or starts a ZooWork Agent.
 *
 *   node scripts/agent-check.mjs
 *
 * Shows which backend is active, whether keys are present (never their values), the ZooWork
 * prepaid balance if a key is configured, and the setup plan for the first funded run.
 */
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    const path = resolve(root, file)
    if (!existsSync(path)) continue
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!match) continue
      const value = match[2].replace(/^["']|["']$/g, "").trim()
      if (value && !process.env[match[1]]) process.env[match[1]] = value
    }
    return file
  }
  return null
}

const envFile = loadEnv()
const has = (k) => Boolean(process.env[k])
const mask = (v) => (v ? `${v.slice(0, 6)}… (${v.length} chars)` : "not set")

const ZOOWORK_BASE = (process.env.ZOOWORK_BASE_URL || "https://clawapi.ecap.gsmo.ai/service/v1").replace(/\/+$/, "")
const DEEPSEEK_BASE = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, "")

console.log(`\nPULL agent inference ${envFile ? `(read ${envFile})` : "(no .env.local)"}\n`)
console.log(`ZOOWORK_API_KEY   ${has("ZOOWORK_API_KEY") ? mask(process.env.ZOOWORK_API_KEY) : "NOT SET"}`)
console.log(`ZOOWORK_ENABLED   ${process.env.ZOOWORK_ENABLED ?? "not set (billing guard ON)"}`)
console.log(`DEEPSEEK_API_KEY  ${has("DEEPSEEK_API_KEY") ? mask(process.env.DEEPSEEK_API_KEY) : "NOT SET"}`)
console.log(`AGENT_PROVIDER    ${process.env.AGENT_PROVIDER ?? "(auto)"}`)

// ── DeepSeek reachability (free, read-only) ─────────────────────────────
if (has("DEEPSEEK_API_KEY")) {
  try {
    const res = await fetch(`${DEEPSEEK_BASE}/models`, {
      headers: { authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` },
    })
    console.log(`\nDeepSeek /models  HTTP ${res.status} ${res.ok ? "— key valid" : "— check the key"}`)
  } catch (error) {
    console.log(`\nDeepSeek /models  failed: ${error.message}`)
  }
} else {
  console.log("\nDeepSeek          skipped (no key)")
}

// ── ZooWork (read-only: balance + stored agent id) ──────────────────────
const storedAgentFile = resolve(root, "data", "zoowork-agent.json")
if (existsSync(storedAgentFile)) {
  try {
    const stored = JSON.parse(readFileSync(storedAgentFile, "utf8"))
    console.log(`ZooWork agent      ${stored.agentId} (stored ${stored.storedAt})`)
  } catch {
    console.log("ZooWork agent      stored file unreadable")
  }
} else {
  console.log("ZooWork agent      none yet — the first funded run creates one")
}

if (has("ZOOWORK_API_KEY")) {
  try {
    const res = await fetch(`${ZOOWORK_BASE}/balance`, {
      headers: { authorization: `Bearer ${process.env.ZOOWORK_API_KEY}` },
    })
    const body = await res.json().catch(() => ({}))
    if (res.ok) {
      console.log(`ZooWork balance    ${body.available_amount ?? "?"} ${body.currency ?? ""} (check Usage in ZooWork Platform for actual charges)`)
    } else {
      console.log(`ZooWork balance    HTTP ${res.status}`)
    }
  } catch (error) {
    console.log(`ZooWork balance    failed: ${error.message}`)
  }
} else {
  console.log("ZooWork balance    skipped (no key)")
}

// ── plan ────────────────────────────────────────────────────────────────
console.log("\nplan for the first funded ZooWork run")
console.log("-".repeat(52))
console.log("1. listModels() and pin the selectable chat default (or ZOOWORK_MODEL)")
console.log("2. createAgent({ name: 'pull-request-writer', labels: {app:'pull-demo'}, persona: AGENTS.md })")
console.log("   — once per project, Idempotency-Key 'pull-demo-agent-v1'; reused from data/zoowork-agent.json")
console.log("3. startAgent() then waitUntilRunning() — needed before any session call")
console.log("4. createSession() per draft, postEvents user.message, stream until run.finished")
console.log("5. Agent tasks draw on the organization's prepaid balance. Check Usage in ZooWork Platform.")
console.log("\nThis check made no Agent-creating request.")
