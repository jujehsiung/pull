#!/usr/bin/env node
/**
 * Send one real email through Resend — a delivery test, not the app's flow.
 *
 *   npm run mail:test                      # → first address in AUTH_ALLOWED_EMAIL
 *   npm run mail:test -- juje@viscosejournal.com
 *
 * This calls the Resend API directly, so it bypasses RESEND_REDIRECT_TO on purpose: what it proves
 * is whether Resend will actually deliver to that recipient. If the domain is not verified, the API
 * answers 403 for any address except the one the Resend account was opened with — that is the whole
 * point of running this before demo day.
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

const key = process.env.RESEND_API_KEY?.trim()
if (!key) {
  console.error("No RESEND_API_KEY in .env.local — see SETUP.md step 4.")
  process.exit(1)
}

const firstAllowed = (process.env.AUTH_ALLOWED_EMAIL ?? "").split(/[,\s]+/).filter(Boolean)[0]
const to = process.argv[2] ?? firstAllowed
if (!to) {
  console.error("No recipient. Pass one: npm run mail:test -- you@yourdomain.com")
  process.exit(1)
}

const from = process.env.RESEND_FROM?.trim() || "PULL <onboarding@resend.dev>"

// Pre-flight: say out loud whether a verified domain exists, because that decides the outcome.
let domainNote = "could not read the domain list"
try {
  const res = await fetch("https://api.resend.com/domains", { headers: { authorization: `Bearer ${key}` } })
  const body = await res.json().catch(() => ({}))
  const domains = body?.data ?? []
  const verified = domains.filter((domain) => domain.status === "verified").map((domain) => domain.name)
  domainNote = verified.length ? `verified: ${verified.join(", ")}` : "no verified domain — only your own Resend account address can receive"
} catch {
  /* non-fatal */
}

console.log(`\nfrom     ${from}`)
console.log(`to       ${to}`)
console.log(`domains  ${domainNote}`)
console.log(`redirect RESEND_REDIRECT_TO ${process.env.RESEND_REDIRECT_TO ? `(${process.env.RESEND_REDIRECT_TO}) — ignored by this test` : "unset"}\n`)

const stamp = new Date().toISOString()
const res = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
  body: JSON.stringify({
    from,
    to: [to],
    subject: `PULL delivery test — ${stamp.slice(11, 19)} UTC`,
    text: `This is a PULL delivery test.\n\nSent ${stamp}\nTo ${to}\n\nIf you can read this on your second device, Resend delivery works for this address.`,
    html: `<div style="font-family:Inter,system-ui,sans-serif;max-width:520px">
      <p style="font-family:ui-monospace,monospace;font-size:11px;letter-spacing:.16em;color:#6b6a66">PULL</p>
      <h1 style="font-size:22px;letter-spacing:-.02em">Delivery test</h1>
      <p style="color:#2c2c2b">Sent <strong>${stamp}</strong> to <strong>${to}</strong>.</p>
      <p style="color:#2c2c2b">Reading this on your second device means email delivery works for this address.</p>
      <p style="color:#8f8b85;font-size:12px">Sent by scripts/send-test-email.mjs — not the app.</p>
    </div>`,
  }),
})

const body = await res.json().catch(() => ({}))
if (!res.ok) {
  console.error(`✗ Resend said ${res.status}: ${body?.message ?? res.statusText}`)
  if (res.status === 403) {
    console.error("\n  That is the resend.dev restriction. Fix it one of two ways:")
    console.error("  1. Verify a domain at https://resend.com/domains, then")
    console.error('     RESEND_FROM="PULL <pull@yourdomain.com>"')
    console.error("  2. Send only to the address on your Resend account.")
  }
  process.exit(1)
}

console.log(`✓ accepted by Resend — id ${body?.id ?? "(none)"}`)
console.log("  Delivery itself is asynchronous. If it does not arrive in a minute, open")
console.log("  https://resend.com/emails and read the status on that message id.\n")
