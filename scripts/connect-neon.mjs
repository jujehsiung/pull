#!/usr/bin/env node
/**
 * Connect Neon in one step. Reads the connection string from the clipboard (or argv[2]),
 * writes DATABASE_URL, pushes the schema, verifies the tables, and runs the full setup check.
 *
 *   npm run db:connect                     # string already copied from the Neon dashboard
 *   npm run db:connect -- postgresql://…   # or pass it explicitly
 *
 * Pooled vs direct is handled here rather than by hand: `-pooler` endpoints sometimes refuse DDL,
 * so if `db:push` fails on the pooled URL this retries once against the direct host, which is the
 * advice SETUP.md step 2 gives. The pooled string stays in .env.local either way.
 */
import { execFileSync, execSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const envPath = resolve(root, ".env.local")

function fromClipboard() {
  try {
    return execSync("pbpaste", { encoding: "utf8" }).trim()
  } catch {
    return ""
  }
}

// Replace the password in the string itself. Re-serialising a URL percent-encodes the placeholder,
// which printed "%E2%80%A6" instead of "…" and made a correctly-written value look corrupted.
function mask(raw) {
  return raw.replace(/(:\/\/[^:/@]+:)[^@]+(@)/, "$1…$2")
}

function loadEnvFile() {
  const out = {}
  if (!existsSync(envPath)) return out
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (match) out[match[1]] = match[2].replace(/^["']|["']$/g, "").trim()
  }
  return out
}

const raw = process.argv[2]?.trim() || fromClipboard()
if (!raw) {
  console.error("Nothing to read. Copy the connection string in Neon, or pass it:\n  npm run db:connect -- postgresql://…")
  process.exit(1)
}

let url
try {
  url = new URL(raw)
} catch {
  console.error(`Not a URL (${raw.length} chars). In Neon press Connect → Node.js, then the copy icon.`)
  process.exit(1)
}
if (!/^postgres(ql)?:$/.test(url.protocol)) {
  console.error(`Expected a postgresql:// URL, got ${url.protocol}`)
  process.exit(1)
}

// Neon needs TLS; a missing sslmode fails slowly rather than loudly, so add it instead of warning.
if (!url.searchParams.get("sslmode")) url.searchParams.set("sslmode", "require")

const pooled = url.hostname.includes("-pooler")
const direct = new URL(url.toString())
direct.hostname = direct.hostname.replace("-pooler.", ".")

const existing = loadEnvFile()
if (existing.DATABASE_URL && existing.DATABASE_URL !== url.toString()) {
  console.log("note  replacing the existing DATABASE_URL in .env.local")
}

// Write it, changing only that one line so comments and other keys survive.
const text = existsSync(envPath) ? readFileSync(envPath, "utf8") : ""
writeFileSync(
  envPath,
  /^DATABASE_URL=.*$/m.test(text)
    ? text.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL=${url.toString()}`)
    : `${text}${text.endsWith("\n") ? "" : "\n"}DATABASE_URL=${url.toString()}\n`,
)

console.log(`\nwrote .env.local → DATABASE_URL=${mask(url.toString())}`)
console.log(`host  ${url.hostname} ${pooled ? "(pooled)" : "(direct — no -pooler in the host)"}`)

/**
 * Push the schema. Two things this needs to survive:
 *  - `strict: true` in drizzle.config.ts makes drizzle-kit ask for confirmation, which dies in a
 *    piped shell ("Interactive prompts require a TTY") — --force answers it, so `npm run db:push`
 *    still behaves interactively when a human runs it and this path does not stall.
 *  - pooled endpoints can refuse DDL, so capture the output and retry once against the direct host.
 */
function push(target, label) {
  console.log(`\n$ npm run db:push -- --force   [${label}]`)
  try {
    const out = execFileSync("npm", ["run", "db:push", "--", "--force"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, DATABASE_URL: target },
    })
    process.stdout.write(out)
    return { ok: true, output: out }
  } catch (error) {
    const output = `${error.stdout ?? ""}${error.stderr ?? ""}`
    process.stdout.write(output)
    return { ok: false, output }
  }
}

const firstHost = pooled ? "pooled" : "direct"
let result = push(url.toString(), firstHost)
if (!result.ok && pooled) {
  console.log("\npooled endpoint did not accept the DDL — retrying against the direct host (same database)")
  result = push(direct.toString(), "direct")
}
if (!result.ok) {
  console.error("\ndb:push failed. The connection itself works, so the cause is in the output above.")
  process.exit(1)
}

// Verify independently of drizzle: read the table list straight from information_schema.
const { neon } = await import("@neondatabase/serverless")
try {
  const sql = neon(url.toString())
  const rows = await sql`select table_name from information_schema.tables
    where table_schema = 'public' order by 1`
  const tables = rows.map((row) => row.table_name)
  console.log(`\npublic schema — ${tables.length} table(s):`)
  console.log(`  ${tables.join(", ") || "(none)"}`)
  const expected = ["boards", "contacts", "emails", "events", "jobs", "looks", "requests", "shipments", "users"]
  const missing = expected.filter((table) => !tables.includes(table))
  if (missing.length) console.error(`\nmissing: ${missing.join(", ")}`)
} catch (error) {
  console.error(`\ncould not list tables: ${String(error.message ?? error).slice(0, 160)}`)
}

console.log("\n$ npm run check")
execFileSync("npm", ["run", "check"], { cwd: root, stdio: "inherit" })
