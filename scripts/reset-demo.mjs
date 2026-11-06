#!/usr/bin/env node
/**
 * Demo reset — removes JOB-SCOPED demo data, never configuration.
 *
 *   node scripts/reset-demo.mjs --job <job uuid>          # one job and everything hanging off it
 *   node scripts/reset-demo.mjs --all                     # refuses: shows what it WOULD delete
 *   node scripts/reset-demo.mjs --all --yes               # every job (the "run it twice" case)
 *
 * Optional:
 *   --with-contacts   also delete all contacts (only with --all; configuration is otherwise kept)
 *   --media           also delete the job's Cloudinary originals under pull/jobs/<jobId>/
 *                     (--all uses the pull/jobs/ prefix). Off by default — it is a CDN delete.
 *
 * `users` and `contacts` are configuration: a demo reset keeps them unless you ask. The script
 * prints the database host with the password masked, a per-table row count, and exits non-zero
 * when it refuses. A destructive script that fires on a typo is worse than no script.
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

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const value = (name) => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : null
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const jobArg = value("--job")
const all = flag("--all")
const yes = flag("--yes")
const withContacts = flag("--with-contacts")
const withMedia = flag("--media")

function usage(message) {
  if (message) console.error(`\nreset-demo: ${message}\n`)
  console.error(`Usage:
  node scripts/reset-demo.mjs --job <job uuid>
  node scripts/reset-demo.mjs --all --yes
Options:
  --with-contacts   also delete contacts (only valid with --all --yes)
  --media           also delete Cloudinary assets under pull/jobs/`)
  process.exit(1)
}

if (!jobArg && !all) usage("pick a mode — --job <uuid> or --all")
if (jobArg && all) usage("--job and --all are mutually exclusive")
if (jobArg && !UUID_RE.test(jobArg)) usage(`"${jobArg}" is not a job UUID`)
if (!jobArg && !all) usage()
if (withContacts && jobArg) usage("--with-contacts is only valid with --all (contacts are not job-scoped)")

const databaseUrl = process.env.DATABASE_URL?.trim()
if (!databaseUrl) {
  console.error("\nreset-demo: DATABASE_URL is not set — nothing was touched.\n")
  process.exit(1)
}

/** `postgres://user:***@host/db` — enough to know which Neon branch is about to lose data. */
function maskedDatabaseUrl(raw) {
  try {
    const url = new URL(raw)
    const auth = url.username ? `${url.username}:***@` : ""
    return `${url.protocol}//${auth}${url.host}${url.pathname}`
  } catch {
    return "(unparseable DATABASE_URL)"
  }
}

const { neon } = await import("@neondatabase/serverless")
const sql = neon(databaseUrl)

const TABLES = ["jobs", "boards", "looks", "requests", "emails", "shipments", "events"]
const emptyCounts = () =>
  Object.fromEntries(TABLES.map((table) => [table, 0]))

async function countsForJob(jobId) {
  const [row] = await sql`select 1 as ok` // connectivity, fails loudly before any delete
  void row
  const [counts] = await sql`select
    (select count(*)::int from jobs where id = ${jobId}) as jobs,
    (select count(*)::int from boards where job_id = ${jobId}) as boards,
    (select count(*)::int from looks where job_id = ${jobId}) as looks,
    (select count(*)::int from requests where job_id = ${jobId}) as requests,
    (select count(*)::int from emails where job_id = ${jobId}) as emails,
    (select count(*)::int from shipments where request_id in (select id from requests where job_id = ${jobId})) as shipments,
    (select count(*)::int from events where job_id = ${jobId}) as events`
  return counts
}

async function deleteJob(jobId) {
  const deleted = {
    shipments: (await sql`delete from shipments where request_id in (select id from requests where job_id = ${jobId}) returning id`).length,
    emails: (await sql`delete from emails where job_id = ${jobId} returning id`).length,
    events: (await sql`delete from events where job_id = ${jobId} returning id`).length,
    requests: (await sql`delete from requests where job_id = ${jobId} returning id`).length,
    looks: (await sql`delete from looks where job_id = ${jobId} returning id`).length,
    boards: (await sql`delete from boards where job_id = ${jobId} returning id`).length,
    jobs: (await sql`delete from jobs where id = ${jobId} returning id`).length,
  }
  return deleted
}

function printTable(counts, contactsRemoved = null) {
  const labels = {
    jobs: "jobs",
    boards: "boards",
    looks: "looks",
    requests: "requests",
    emails: "emails",
    shipments: "shipments",
    events: "events",
  }
  console.log(`  ${"table".padEnd(12)}rows`)
  for (const table of TABLES) console.log(`  ${labels[table].padEnd(12)}${counts[table] ?? 0}`)
  if (contactsRemoved !== null) console.log(`  ${"contacts".padEnd(12)}${contactsRemoved}`)
}

async function removeMedia(prefix) {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME?.trim()
  const key = process.env.CLOUDINARY_API_KEY?.trim()
  const secret = process.env.CLOUDINARY_API_SECRET?.trim()
  if (!cloud || !key || !secret) {
    console.error("  media        FAILED — CLOUDINARY_* not set")
    return false
  }
  try {
    const { v2 } = await import("cloudinary")
    v2.config({ cloud_name: cloud, api_key: key, api_secret: secret, secure: true })
    const result = await v2.uploader.delete_resources_by_prefix(prefix, { resource_type: "image" })
    const removed = Object.keys(result?.deleted ?? {}).length
    console.log(`  media        ${removed} asset(s) deleted under ${prefix}`)
    return true
  } catch (error) {
    console.error(`  media        FAILED — ${error instanceof Error ? error.message : String(error)}`)
    return false
  }
}

console.log(`\nPULL demo reset`)
console.log(`  database     ${maskedDatabaseUrl(databaseUrl)}`)
const [identity] = await sql`select current_database() as db`
if (identity?.db) console.log(`  current db   ${identity.db}`)

let status = 0

if (jobArg) {
  const [job] = await sql`select id, title, client_name from jobs where id = ${jobArg}`
  if (!job) {
    console.error(`\n  "${jobArg}" is not a job in this database — nothing was deleted.\n`)
    process.exit(1)
  }
  console.log(`  mode         job ${job.id} — "${job.title}" (${job.client_name})`)

  const planned = await countsForJob(job.id)
  const counts = await deleteJob(job.id)
  console.log(`\nDeleted:`)
  printTable(counts)
  if (TABLES.some((table) => planned[table] !== counts[table])) {
    console.log(`  (rows changed while the reset ran — planned ${JSON.stringify(planned)})`)
  }
  if (withMedia) {
    const mediaOk = await removeMedia(`pull/jobs/${job.id}/`)
    if (!mediaOk) status = 1
  } else {
    console.log(`  media        skipped (pass --media to delete Cloudinary originals)`)
  }
  console.log(`\nDone. users and contacts were not touched.\n`)
} else {
  const jobs = await sql`select id, title, client_name from jobs order by created_at`
  const planned = emptyCounts()
  for (const job of jobs) {
    const counts = await countsForJob(job.id)
    for (const table of TABLES) planned[table] += counts[table] ?? 0
  }

  console.log(`  mode         ${all ? "ALL jobs" : ""}`)
  console.log(`  jobs         ${jobs.length}${jobs.length ? ` — ${jobs.map((job) => `"${job.title}"`).join(", ")}` : ""}`)
  console.log(`  contacts     ${withContacts ? "WILL be deleted (--with-contacts)" : "kept (configuration)"}`)
  console.log(`  media        ${withMedia ? "WILL delete pull/jobs/ assets" : "kept (pass --media to delete)"}`)

  if (!yes) {
    console.log(`\nWould delete:`)
    printTable(planned, withContacts ? "all" : null)
    console.error(`\nRefusing to delete every job without --yes. Re-run with: node scripts/reset-demo.mjs --all --yes\n`)
    process.exit(2)
  }

  const totals = emptyCounts()
  for (const job of jobs) {
    const counts = await deleteJob(job.id)
    for (const table of TABLES) totals[table] += counts[table] ?? 0
  }
  let contactsRemoved = null
  if (withContacts) {
    contactsRemoved = (await sql`delete from contacts returning id`).length
  }
  console.log(`\nDeleted:`)
  printTable(totals, contactsRemoved)
  if (withMedia) {
    const mediaOk = await removeMedia("pull/jobs/")
    if (!mediaOk) status = 1
  } else {
    console.log(`  media        skipped (pass --media to delete Cloudinary originals)`)
  }
  console.log(`\nDone. users were not touched.${withContacts ? " Contacts were deleted as requested." : " Contacts were kept."}\n`)
}

process.exit(status)
