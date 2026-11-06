#!/usr/bin/env node
/**
 * Seed a pristine demo job for a cold start.
 *
 *   node scripts/seed-demo.mjs
 *
 * Creates "Oscar campaign" for Timothée Chalamet with dates relative to today (call-in today,
 * shoot +2 days, return +10 days), status draft, no looks. Nothing is published and no contacts
 * are created — Contacts owns that seed. Idempotent-ish: if the job already exists it says so and
 * exits 0 without creating a duplicate, so the seed can run before every demo.
 */
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
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
  break
}

const databaseUrl = process.env.DATABASE_URL?.trim()
if (!databaseUrl) {
  console.error("\nseed-demo: DATABASE_URL is not set — nothing was created.\n")
  process.exit(1)
}

const allowed = (process.env.AUTH_ALLOWED_EMAIL ?? "").split(/[,\s]+/).filter(Boolean)
if (allowed.length === 0) {
  console.error("\nseed-demo: AUTH_ALLOWED_EMAIL is not set — sign in once at /login first.\n")
  process.exit(1)
}

const { neon } = await import("@neondatabase/serverless")
const sql = neon(databaseUrl)

const CLIENT = "Timothée Chalamet"
const TITLE = "Oscar campaign"

const [stylist] = await sql`select id, email from users where email = ${allowed[0]} limit 1`
if (!stylist) {
  console.error(
    `\nseed-demo: no stylist row for ${allowed[0]}. Open /login, receive the magic link and sign in once — then re-run this.\n`,
  )
  process.exit(1)
}

const [existing] = await sql`
  select id, status, created_at from jobs
  where user_id = ${stylist.id} and client_name = ${CLIENT} and title = ${TITLE}
  order by created_at limit 1`
if (existing) {
  console.log(`\nseed-demo: "${TITLE}" already exists for ${stylist.email} — no duplicate created.`)
  console.log(`  job     ${existing.id}`)
  console.log(`  status  ${existing.status}`)
  console.log(`  open    http://localhost:3000/studio/jobs/${existing.id}\n`)
  process.exit(0)
}

/** ISO date `days` from today (UTC — stable for a demo machine). */
function isoDate(days) {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)
}
const callIn = isoDate(0)
const shoot = isoDate(2)
const returnDate = isoDate(10)

const [job] = await sql`
  insert into jobs (user_id, client_name, title, shoot_date, call_in_date, return_date, status)
  values (${stylist.id}, ${CLIENT}, ${TITLE}, ${shoot}, ${callIn}, ${returnDate}, 'draft')
  returning id, status, shoot_date, call_in_date, return_date`

/** pg returns date columns as Date in some drivers; the demo wants plain ISO dates. */
const iso = (value) => (value instanceof Date ? value.toISOString().slice(0, 10) : String(value))

console.log(`\nseed-demo: created a fresh demo job.`)
console.log(`  stylist     ${stylist.email}`)
console.log(`  job         ${job.id}`)
console.log(`  client      ${CLIENT}`)
console.log(`  call-in     ${iso(job.call_in_date)}`)
console.log(`  shoot       ${iso(job.shoot_date)}`)
console.log(`  return      ${iso(job.return_date)}`)
console.log(`  looks       0 · boards 0 · draft (nothing published)`)
console.log(`  next        npm run dev → http://localhost:3000/studio/jobs/${job.id}`)
console.log(`\nNext: load the 5 demo contacts in /studio/contacts, then drop the 10 sample screenshots.\n`)
