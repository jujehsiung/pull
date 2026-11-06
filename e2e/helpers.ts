/**
 * Shared helpers for the M4 Playwright spec.
 *
 * The app's auth is an HMAC-signed cookie (src/lib/auth.ts), so the test mints the same token the
 * login flow would: base64url(JSON payload) + "." + HMAC-SHA256(AUTH_SECRET). That keeps the test
 * out of the magic-link inbox, and — importantly — lets the public-link tests run in a context with
 * **no** cookies at all, which is the security property we want to prove.
 */
import { execFileSync } from "node:child_process"
import { createHmac } from "node:crypto"
import { existsSync, mkdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import type { Browser, BrowserContext } from "@playwright/test"

export type Env = Record<string, string>

let cached: Env | null = null

/** Read .env.local exactly like the demo scripts do (first file wins). */
export function env(): Env {
  if (cached) return cached
  const out: Env = {}
  for (const file of [".env.local", ".env"]) {
    const path = resolve(process.cwd(), file)
    if (!existsSync(path)) continue
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!match) continue
      const [, key, raw] = match
      const value = raw.replace(/^["']|["']$/g, "").trim()
      if (value && !out[key]) out[key] = value
    }
    break
  }
  cached = out
  return out
}

/** Make .env.local visible to the DB helper too (the app loads it itself, the test does not). */
function applyEnv(): void {
  for (const [key, value] of Object.entries(env())) {
    if (!process.env[key]) process.env[key] = value
  }
}

export function firstAllowedEmail(): string {
  const allowed = (env().AUTH_ALLOWED_EMAIL ?? "").split(/[,\s]+/).filter(Boolean)
  if (allowed.length === 0) throw new Error("AUTH_ALLOWED_EMAIL is not set in .env.local")
  return allowed[0]
}

const b64url = (value: string): string => Buffer.from(value).toString("base64url")

/** The exact `pull_session` value src/lib/auth.ts would set after a magic-link login. */
export function sessionCookie(): string {
  const secret = env().AUTH_SECRET
  if (!secret) throw new Error("AUTH_SECRET is not set in .env.local")
  const body = b64url(
    JSON.stringify({
      email: firstAllowedEmail(),
      purpose: "session",
      exp: Math.floor(Date.now() / 1000) + 60 * 60,
    }),
  )
  const signature = createHmac("sha256", secret).update(body).digest("base64url")
  return `pull_session=${body}.${signature}`
}

/** Authenticated context: the cookie is added to an otherwise clean context. */
export async function stylistContext(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext()
  const baseURL = "http://localhost:3000"
  const [name, value] = sessionCookie().split("=")
  await context.addCookies([
    { name, value, url: `${baseURL}/`, httpOnly: true, sameSite: "Lax" },
  ])
  return context
}

/** Public context: no cookies. Client board and intake links must work here. */
export async function publicContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext()
}

/** ISO date `offset` days from today (the demo's date fields). */
export function isoDate(offset: number): string {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  return date.toISOString().slice(0, 10)
}

/** Absolute path to a screenshot artifact, creating e2e/artifacts first. */
export function artifact(name: string): string {
  const dir = resolve(process.cwd(), "e2e/artifacts")
  mkdirSync(dir, { recursive: true })
  return resolve(dir, name)
}

/** Remove one job and everything hanging off it. Never touches users or contacts. */
export function resetJob(jobId: string): void {
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) {
    console.warn(`[e2e] not resetting: "${jobId}" is not a job uuid`)
    return
  }
  try {
    execFileSync(process.execPath, ["scripts/reset-demo.mjs", "--job", jobId], {
      cwd: process.cwd(),
      stdio: "pipe",
      env: { ...process.env, ...env() },
    })
    console.log(`[e2e] reset job ${jobId}`)
  } catch (error) {
    console.warn(`[e2e] could not reset job ${jobId}:`, error instanceof Error ? error.message : error)
  }
}

export interface ShipmentCheck {
  labelUrl: string | null
  trackingNumber: string | null
  chosenRateId: string | null
  trackingStatus: string | null
}

/** Read the job's shipments row straight from Neon — proof the gate wrote nothing. */
export async function shipmentForJob(jobId: string): Promise<ShipmentCheck | null> {
  applyEnv()
  const { neon } = await import("@neondatabase/serverless")
  const sql = neon(process.env.DATABASE_URL as string)
  const [row] = await sql`
    select s.label_url, s.tracking_number, s.chosen_rate_id, s.tracking_status
    from shipments s
    join requests r on r.id = s.request_id
    where r.job_id = ${jobId}
    limit 1`
  if (!row) return null
  return {
    labelUrl: row.label_url,
    trackingNumber: row.tracking_number,
    chosenRateId: row.chosen_rate_id,
    trackingStatus: row.tracking_status,
  }
}
