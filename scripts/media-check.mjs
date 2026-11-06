#!/usr/bin/env node
/**
 * Cloudinary integration check — beyond `ping`.
 *
 *   npm run media:test
 *
 * Three things the demo actually depends on, in order:
 *   1. the server signs an upload exactly the way src/lib/cloudinary.ts does, and Cloudinary
 *      accepts that signature (a wrong param set or secret shows up here, not on demo day);
 *   2. the board crop transform (trim → fill 3:4 → auto format) returns a real image;
 *   3. the test asset is destroyed again, so the account is left as it was found.
 */
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { createHash } from "node:crypto"

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

const cloud = process.env.CLOUDINARY_CLOUD_NAME?.trim()
const key = process.env.CLOUDINARY_API_KEY?.trim()
const secret = process.env.CLOUDINARY_API_SECRET?.trim()
if (!cloud || !key || !secret) {
  console.error("Cloudinary is not connected — set CLOUDINARY_* in .env.local (SETUP.md step 3)")
  process.exit(1)
}

/** Same algorithm as cloudinary.utils.api_sign_request: sha1 of sorted key=value pairs + secret. */
function sign(params) {
  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&")
  return createHash("sha1").update(toSign + secret).digest("hex")
}

const BASE = `https://api.cloudinary.com/v1_1/${cloud}`
let failures = 0
const ok = (label, detail) => console.log(`  ok   ${label}${detail ? ` — ${detail}` : ""}`)
const bad = (label, detail) => {
  failures += 1
  console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`)
}

// ── 1. signed upload ────────────────────────────────────────────────────
const timestamp = Math.round(Date.now() / 1000)
const folder = "pull/demo-check"
const signature = sign({ folder, timestamp })
const ONE_PIXEL_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

const form = new FormData()
form.append("file", ONE_PIXEL_PNG)
form.append("api_key", key)
form.append("timestamp", String(timestamp))
form.append("folder", folder)
form.append("signature", signature)

const uploadRes = await fetch(`${BASE}/auto/upload`, { method: "POST", body: form })
const upload = await uploadRes.json().catch(() => ({}))
if (uploadRes.ok && upload.public_id) ok("signed upload accepted", upload.public_id)
else bad("signed upload", `HTTP ${uploadRes.status} ${upload.error?.message ?? ""}`)

// ── 2. the board transform ──────────────────────────────────────────────
// Run it against Cloudinary's built-in `sample` photo, not the 1×1 pixel above: trim:20 on a
// 1×1 solid image trims it to zero area and Cloudinary answers 400, which says nothing about
// whether the demo's real screenshots will crop.
const transform = "e_trim:20,c_fill,w_1200,h_1600,g_auto,q_auto,f_auto"
const url = `https://res.cloudinary.com/${cloud}/image/upload/${transform}/sample.jpg`
try {
  const res = await fetch(url, { headers: { accept: "image/webp,image/*" } })
  const type = res.headers.get("content-type") ?? "?"
  if (res.ok) ok("board transform", `${res.status} ${type} · trim → 3:4 fill → auto format`)
  else bad("board transform", `HTTP ${res.status} · ${url}`)
} catch (error) {
  bad("board transform", String(error.message ?? error))
}

// ── 3. clean up ─────────────────────────────────────────────────────────
if (upload.public_id) {
  const destroyTs = Math.round(Date.now() / 1000)
  const destroyForm = new FormData()
  destroyForm.append("public_id", upload.public_id)
  destroyForm.append("api_key", key)
  destroyForm.append("timestamp", String(destroyTs))
  destroyForm.append("signature", sign({ public_id: upload.public_id, timestamp: destroyTs }))
  const destroyRes = await fetch(`${BASE}/image/destroy`, { method: "POST", body: destroyForm })
  const destroyed = await destroyRes.json().catch(() => ({}))
  if (destroyed.result === "ok") ok("test asset destroyed", upload.public_id)
  else bad("test asset destroyed", JSON.stringify(destroyed).slice(0, 120))
}

console.log(`\n${failures === 0 ? "Cloudinary is ready for Act 1." : `${failures} check(s) failed.`}\n`)
process.exit(failures === 0 ? 0 : 1)
