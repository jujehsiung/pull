#!/usr/bin/env node
/**
 * Setup checker — run `npm run check` after each step.
 * It reads .env.local (or .env), reports what is configured, and pings each service
 * so a bad key fails here instead of halfway through the demo.
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
      const [, key, rawValue] = match
      const value = rawValue.replace(/^["']|["']$/g, "").trim()
      if (value && !process.env[key]) process.env[key] = value
    }
    return file
  }
  return null
}

const envFile = loadEnv()
const has = (k) => Boolean(process.env[k])
const results = []
const add = (step, name, ok, detail = "") => results.push({ step, name, ok, detail })

console.log(`\nPULL demo — setup check ${envFile ? `(read ${envFile})` : "(no .env.local found)"}\n`)

// ── step 1 · app ────────────────────────────────────────────────────────
add(1, "Node runtime", Number(process.versions.node.split(".")[0]) >= 20, `v${process.versions.node}`)
add(1, "Dependencies installed", existsSync(resolve(root, "node_modules", "next")), "node_modules/next")

// ── step 2 · Neon ───────────────────────────────────────────────────────
if (has("DATABASE_URL")) {
  try {
    const { neon } = await import("@neondatabase/serverless")
    const sql = neon(process.env.DATABASE_URL)
    const rows = await sql`select 1 as ok`
    add(2, "Neon connection", rows?.[0]?.ok === 1, "SELECT 1 succeeded")
    try {
      const t = await sql`select count(*)::int as n from information_schema.tables where table_schema = 'public'`
      const n = t?.[0]?.n ?? 0
      add(2, "Schema migrated", n > 0, `${n} tables in public`)
    } catch {
      add(2, "Schema migrated", false, "run: npm run db:push")
    }
  } catch (error) {
    add(2, "Neon connection", false, String(error.message).slice(0, 120))
  }
} else {
  add(2, "Neon connection", false, "set DATABASE_URL")
}

// ── step 3 · Cloudinary ─────────────────────────────────────────────────
if (has("CLOUDINARY_CLOUD_NAME") && has("CLOUDINARY_API_KEY") && has("CLOUDINARY_API_SECRET")) {
  try {
    const { v2: cloudinary } = await import("cloudinary")
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    })
    const ping = await cloudinary.api.ping()
    add(3, "Cloudinary auth", ping?.status === "ok", "ping ok")
  } catch (error) {
    add(3, "Cloudinary auth", false, String(error.message ?? error).slice(0, 120))
  }
} else {
  add(3, "Cloudinary auth", false, "set CLOUDINARY_CLOUD_NAME / API_KEY / API_SECRET")
}

// ── step 4 · Resend ─────────────────────────────────────────────────────
// "Outbound mail" is the line that matters: without a verified domain, Resend's onboarding sender
// 403s every recipient except your own address, so the capture switch has to stand in for a domain.
//
// The key itself is validated by what /domains answers, and a SENDING-ONLY key — the kind SETUP
// step 4 tells you to create — answers 401 restricted_api_key there while being perfectly good.
// Treating that as "key missing" is a false alarm, so it is reported as a scope, not a failure.
const captureTo = process.env.RESEND_REDIRECT_TO?.trim()
if (has("RESEND_API_KEY")) {
  try {
    const res = await fetch("https://api.resend.com/domains", {
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    })
    const body = await res.json().catch(() => ({}))
    const domains = body?.data ?? []
    const restricted = !res.ok && /restricted_api_key|restricted to only send/i.test(JSON.stringify(body))
    const verified = domains.find((d) => d.status === "verified")

    if (res.ok) {
      add(4, "Resend key", true, `full access — ${domains.length} domain(s)`)
    } else if (restricted) {
      add(4, "Resend key", true, "sending-only key (cannot read the domain list — expected)")
    } else {
      add(4, "Resend key", false, `HTTP ${res.status} ${body?.message ?? ""}`.trim())
    }

    // A sending-only key cannot tell us whether a domain is verified, so capture is the only thing
    // we can vouch for; say so rather than guessing.
    add(
      4,
      "Outbound mail",
      Boolean(verified) || Boolean(captureTo),
      verified
        ? `verified domain ${verified.name} — real recipients`
        : captureTo
          ? `captured → ${captureTo} (brand mail not really sent)`
          : res.ok
            ? "no verified domain and no RESEND_REDIRECT_TO — Act 2 brand emails will 403"
            : "domain state unknown (sending-only key) — set RESEND_REDIRECT_TO or verify a domain",
    )
  } catch (error) {
    add(4, "Resend key", false, String(error.message).slice(0, 120))
  }
} else {
  add(4, "Resend key", false, "set RESEND_API_KEY")
}

// ── step 5 · Shippo ─────────────────────────────────────────────────────
if (has("SHIPPO_API_KEY")) {
  const mode = process.env.SHIPPO_API_KEY.startsWith("shippo_test_") ? "test" : "live"
  try {
    const res = await fetch("https://api.goshippo.com/shipments?page=1&results=1", {
      headers: { authorization: `ShippoToken ${process.env.SHIPPO_API_KEY}` },
    })
    add(5, `Shippo key (${mode})`, res.ok, res.ok ? "authenticated" : `HTTP ${res.status}`)
    if (mode === "live") {
      const gated = process.env.SHIPPO_ALLOW_PURCHASE !== "true"
      add(5, "Live purchases", true, gated ? "gated — labels cannot be bought until SHIPPO_ALLOW_PURCHASE=true" : "ENABLED — a label will cost real money")
    }
  } catch (error) {
    add(5, `Shippo key (${mode})`, false, String(error.message).slice(0, 120))
  }
} else {
  add(5, "Shippo key", false, "set SHIPPO_API_KEY (test key first)")
}

// ── step 6 · auth secrets ───────────────────────────────────────────────
add(6, "AUTH_SECRET", (process.env.AUTH_SECRET ?? "").length >= 32, "32+ chars")
add(6, "LINK_SECRET", (process.env.LINK_SECRET ?? "").length >= 32, "32+ chars")
// AUTH_ALLOWED_EMAIL is one address or a list — count them, and flag anything malformed.
const allowedEmails = (process.env.AUTH_ALLOWED_EMAIL ?? "").split(/[,\s]+/).filter(Boolean)
const badEmails = allowedEmails.filter((address) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))
add(
  6,
  "AUTH_ALLOWED_EMAIL",
  allowedEmails.length > 0 && badEmails.length === 0,
  allowedEmails.length === 0
    ? "set at least one sign-in address"
    : badEmails.length
      ? `not an email: ${badEmails.join(", ")}`
      : `${allowedEmails.length} allowed — ${allowedEmails.join(", ")}`,
)

// ── report ──────────────────────────────────────────────────────────────
const byStep = new Map()
for (const r of results) {
  if (!byStep.has(r.step)) byStep.set(r.step, [])
  byStep.get(r.step).push(r)
}
const stepNames = {
  1: "app",
  2: "Neon (database)",
  3: "Cloudinary (images)",
  4: "Resend (email)",
  5: "Shippo (labels)",
  6: "auth secrets",
}
for (const [step, rows] of [...byStep.entries()].sort((a, b) => a[0] - b[0])) {
  const ok = rows.every((r) => r.ok)
  console.log(`${ok ? "✅" : "⏳"} step ${step} · ${stepNames[step]}`)
  for (const r of rows) console.log(`   ${r.ok ? "ok  " : "todo"} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`)
}
const remaining = results.filter((r) => !r.ok).length
console.log(remaining === 0 ? "\nAll steps configured. Run `npm run dev`.\n" : `\n${remaining} item(s) to go — see SETUP.md.\n`)
process.exit(0)
