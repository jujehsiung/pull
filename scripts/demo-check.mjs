#!/usr/bin/env node
/**
 * Demo-day preflight — read-only. "Is this laptop ready?"
 *
 *   node scripts/demo-check.mjs               # check the latest demo job
 *   node scripts/demo-check.mjs --job <uuid>  # check a specific job
 *
 * One line per check, exit non-zero if anything that would break the demo is off. Warnings are
 * things that are intentional in dev (captured mail, unsigned webhook, live purchases enabled) or
 * recoverable before the audience.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
let envFile = null
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
  envFile = file
  break
}

const args = process.argv.slice(2)
const jobArg = args.includes("--job") ? args[args.indexOf("--job") + 1] : null
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const checks = []
const pass = (label, detail = "") => checks.push({ label, tone: "pass", detail })
const warn = (label, detail = "") => checks.push({ label, tone: "warn", detail })
const fail = (label, detail = "") => checks.push({ label, tone: "fail", detail })

const strip = (value, max = 90) => {
  const text = String(value ?? "").replace(/\s+/g, " ").trim()
  return text.length > max ? `${text.slice(0, max)}…` : text
}

console.log(`\nPULL demo preflight — ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`)
console.log(`env: ${envFile ?? "none found (.env.local missing)"}\n`)

// ── runtime ──────────────────────────────────────────────────────────────
pass("node runtime", `v${process.versions.node}`)
const depsOk = existsSync(resolve(root, "node_modules/next")) && existsSync(resolve(root, "node_modules/tesseract.js"))
depsOk ? pass("dependencies", "next + tesseract.js present") : fail("dependencies", "run npm install")
if (!envFile) fail(".env.local", "create it from .env.example (SETUP.md)")

// ── database ─────────────────────────────────────────────────────────────
let sql = null
let stylist = null
if (!process.env.DATABASE_URL?.trim()) {
  fail("database", "DATABASE_URL is not set")
} else {
  try {
    const { neon } = await import("@neondatabase/serverless")
    sql = neon(process.env.DATABASE_URL)
    const [one] = await sql`select 1 as ok`
    if (one?.ok === 1) pass("database", "Neon SELECT 1")
    else fail("database", "SELECT 1 returned no row")
    try {
      const [tables] = await sql`select count(*)::int as n from information_schema.tables where table_schema = 'public'`
      const n = tables?.n ?? 0
      n >= 9 ? pass("schema", `${n} tables in public`) : fail("schema", `${n} tables — run npm run db:push`)
    } catch (error) {
      fail("schema", strip(error.message))
    }
  } catch (error) {
    fail("database", strip(error.message))
  }
}

// ── Cloudinary ───────────────────────────────────────────────────────────
const cloudVars = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"]
if (cloudVars.every((key) => process.env[key]?.trim())) {
  try {
    const { v2 } = await import("cloudinary")
    v2.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    })
    const ping = await v2.api.ping()
    ping?.status === "ok" ? pass("cloudinary", "ping ok — signed uploads will work") : fail("cloudinary", "ping failed")
  } catch (error) {
    fail("cloudinary", strip(error.message))
  }
} else {
  fail("cloudinary", "CLOUDINARY_* is incomplete")
}

// ── Resend ───────────────────────────────────────────────────────────────
if (process.env.RESEND_API_KEY?.trim()) {
  const from = process.env.RESEND_FROM?.trim()
  pass("resend", `key present${from ? ` · from ${from}` : " · RESEND_FROM not set (uses onboarding@resend.dev)"}`)
  const captureTo = process.env.RESEND_REDIRECT_TO?.trim()
  if (captureTo) {
    warn("mail mode", `CAPTURED → ${captureTo} (brand mail is not reaching real inboxes; unset for a real send)`)
  } else {
    pass("mail mode", "real recipients — requires a verified sending domain")
  }
} else {
  fail("resend", "RESEND_API_KEY is not set (Act 2/3 email)")
}

// ── Shippo ───────────────────────────────────────────────────────────────
if (process.env.SHIPPO_API_KEY?.trim()) {
  const key = process.env.SHIPPO_API_KEY
  const mode = key.startsWith("shippo_test_") ? "test" : "live"
  try {
    const response = await fetch("https://api.goshippo.com/shipments?page=1&results=1", {
      headers: { authorization: `ShippoToken ${key}` },
    })
    response.ok ? pass("shippo", `${mode} key authenticated`) : fail("shippo", `${mode} key → HTTP ${response.status}`)
  } catch (error) {
    fail("shippo", strip(error.message))
  }
  const gateOn = process.env.SHIPPO_ALLOW_PURCHASE === "true"
  if (mode === "test") {
    pass("purchase gate", "test key — labels are test labels, no real money")
  } else if (gateOn) {
    warn("purchase gate", "ENABLED — a label purchase spends real money; say so before clicking")
  } else {
    pass("purchase gate", "gated (SHIPPO_ALLOW_PURCHASE=false) — buying is blocked on stage, which is intended")
  }
} else {
  fail("shippo", "SHIPPO_API_KEY is not set (Act 3 rates/labels)")
}

// ── auth ─────────────────────────────────────────────────────────────────
process.env.AUTH_SECRET?.trim().length >= 32
  ? pass("auth secret", "AUTH_SECRET 32+ chars")
  : fail("auth secret", "AUTH_SECRET must be 32+ chars")
process.env.LINK_SECRET?.trim().length >= 32
  ? pass("link secret", "LINK_SECRET 32+ chars")
  : fail("link secret", "LINK_SECRET must be 32+ chars")
const allowed = (process.env.AUTH_ALLOWED_EMAIL ?? "").split(/[,\s]+/).filter(Boolean)
allowed.length
  ? pass("allow-list", `${allowed.length} address(es): ${allowed.join(", ")}`)
  : fail("allow-list", "AUTH_ALLOWED_EMAIL is not set")

// ── demo data ────────────────────────────────────────────────────────────
if (sql) {
  try {
    if (allowed[0]) {
      ;[stylist] = await sql`select id, email, studio_address from users where email = ${allowed[0]} limit 1`
    }
    if (!stylist) {
      fail("stylist row", "no users row — open /login and sign in once")
      fail("studio address", "cannot check without a stylist row")
    } else {
      const address = stylist.studio_address ?? {}
      const missing = ["street1", "city", "zip", "country"].filter((key) => !String(address[key] ?? "").trim())
      if (missing.length === 0) {
        pass("studio address", `${address.street1}, ${address.city} ${address.zip}, ${address.country}`)
      } else {
        fail("studio address", `incomplete — missing ${missing.join(", ")} (intake cannot quote rates)`)
      }
    }

    let job = null
    if (jobArg) {
      if (!UUID_RE.test(jobArg)) {
        fail("--job", `"${jobArg}" is not a UUID`)
      } else {
        ;[job] = await sql`select id, title, status, published_at, shoot_date from jobs where id = ${jobArg}`
        if (!job) fail("--job", "no job with that id")
      }
    } else if (stylist) {
      ;[job] = await sql`
        select id, title, status, published_at, shoot_date from jobs
        where user_id = ${stylist.id} order by created_at desc limit 1`
    }

    if (job) {
      const [counts] = await sql`select
        (select count(*)::int from looks where job_id = ${job.id} and hidden_at is null) as looks,
        (select count(*)::int from boards where job_id = ${job.id}) as boards,
        (select count(*)::int from requests where job_id = ${job.id}) as requests,
        (select count(*)::int from shipments where request_id in (select id from requests where job_id = ${job.id})) as shipments`
      const readiness =
        counts.looks === 0 && job.status === "draft"
          ? " · cold start, ready for Act 1"
          : job.published_at
            ? " · published (client link exists)"
            : ""
      // Default is "most recently created", because after demo:seed the fresh (empty) job is the one
      // the demo will start on — that must report READY, not warn about the old fixture job.
      pass(
        `demo job${jobArg ? "" : " (latest)"}`,
        `${job.title} · ${job.status} · ${counts.looks} looks / ${counts.boards} boards · ${counts.requests} requests · ${counts.shipments} shipments${readiness}`,
      )
      console.log(
        `   ↳ ${job.id} — ${
          counts.looks === 0 && job.status === "draft"
            ? "cold start: drop the 10 sample screenshots to begin Act 1"
            : "this is the job the preflight checked (use --job to pin another)"
        }`,
      )
    } else if (!jobArg) {
      fail("demo job", "no job yet — run node scripts/seed-demo.mjs")
    }

    if (stylist) {
      const [contactCounts] = await sql`select count(*)::int as n from contacts where user_id = ${stylist.id}`
      const n = contactCounts?.n ?? 0
      n > 0
        ? pass("contacts", `${n} contact(s) — Act 3 requests can resolve`)
        : warn("contacts", "0 contacts — load the 5 demo brands in /studio/contacts before Act 3")
    }
  } catch (error) {
    fail("demo data", strip(error.message))
  }
}

// ── assets / links / dev ergonomics ──────────────────────────────────────
const fixtureDir = resolve(root, "public/fixtures/looks")
const fixtures = existsSync(fixtureDir)
  ? readdirSync(fixtureDir).filter((file) => file.endsWith(".png")).length
  : 0
fixtures === 10
  ? pass("fixture set", "10 screenshots in public/fixtures/looks")
  : fail("fixture set", `${fixtures}/10 — the FR-4 acceptance set is missing`)

const publicBase = process.env.PUBLIC_BASE_URL?.trim()
if (!publicBase) {
  warn("public links", "PUBLIC_BASE_URL is not set — client/intake links will not open on a phone")
} else if (/localhost|127\.0\.0\.1/.test(publicBase)) {
  warn("public links", `${publicBase} is localhost — set the LAN origin for a phone demo`)
} else {
  pass("public links", publicBase)
}

process.env.SHIPPO_WEBHOOK_SECRET?.trim()
  ? pass("tracking webhook", "secret configured — unsigned updates are rejected")
  : warn("tracking webhook", "SHIPPO_WEBHOOK_SECRET is empty — unsigned tracking updates are accepted (demo only)")

try {
  const app = await fetch("http://localhost:3000", { signal: AbortSignal.timeout(2500) })
  app.ok ? pass("dev server", "http://localhost:3000 is up") : warn("dev server", `http://localhost:3000 → HTTP ${app.status}`)
} catch {
  warn("dev server", "http://localhost:3000 is not answering — run npm run dev")
}

// ── report ───────────────────────────────────────────────────────────────
const icon = { pass: "✓", warn: "!", fail: "✗" }
console.log()
for (const check of checks) {
  console.log(`  ${icon[check.tone]} ${check.label.padEnd(18)}${check.detail ? check.detail : ""}`)
}
const passed = checks.filter((check) => check.tone === "pass").length
const warned = checks.filter((check) => check.tone === "warn").length
const failed = checks.filter((check) => check.tone === "fail").length

console.log(`\n  ${passed} pass · ${warned} warning${warned === 1 ? "" : "s"} · ${failed} fail${failed === 1 ? "" : "s"}`)
if (failed > 0) {
  console.error(`\nNOT READY — fix the ${failed} ✗ item${failed === 1 ? "" : "s"} above before the demo.\n`)
  process.exit(1)
}
console.log(`\nREADY${warned ? ` — ${warned} warning${warned === 1 ? "" : "s"} to be aware of` : ""}. Start with the tesseract pre-warm in DEMO.md.\n`)
