#!/usr/bin/env node
/**
 * agent:models — read the ZooWork model catalog, focused on the image slots.
 *
 * ZooWork's catalog marks which aliases fill `model`, `imageModel`,
 * `imageGenerationModel` and `pdfModel` (reference/models). That is the only
 * honest way to answer "does this account have an image model, and what is its
 * alias" — the docs say read the current catalog rather than hardcoding a name.
 *
 *   ZOOWORK_API_KEY=... npm run agent:models
 *
 * Reads .env.local / .env like the app. Prints image-capable rows and any
 * row whose name looks like an image family, so an edit model (Qwen, Flux,
 * GPT-image) is visible too. Never prints the key.
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

const key = process.env.ZOOWORK_API_KEY ?? ""
const base = (process.env.ZOOWORK_BASE_URL ?? "https://clawapi.ecap.gsmo.ai/service/v1").replace(/\/+$/, "")

if (!key) {
  console.error("agent:models — ZOOWORK_API_KEY is not set, so there is no catalog to read.")
  console.error("Add it (and ZOOWORK_ENABLED=true once billing is approved) to .env.local, then re-run.")
  process.exit(1)
}

const res = await fetch(`${base}/models`, { headers: { authorization: `Bearer ${key}` } }).catch((error) => {
  console.error("agent:models — could not reach ZooWork:", error instanceof Error ? error.message : error)
  return null
})

if (!res) process.exit(1)
if (!res.ok) {
  console.error(`agent:models — ${res.status} from ${base}/models`)
  console.error((await res.text().catch(() => "")).slice(0, 300))
  process.exit(1)
}

const rows = await res.json().catch(() => null)
const models = Array.isArray(rows) ? rows : (rows?.data ?? rows?.models ?? [])
if (!Array.isArray(models) || models.length === 0) {
  console.error("agent:models — the catalog came back empty or in an unexpected shape.")
  process.exit(1)
}

const slots = (model) => {
  const value = model.default_for ?? model.defaultFor ?? []
  return (Array.isArray(value) ? value : [value]).map(String)
}
const isImageSlot = (model) =>
  slots(model).some((slot) => slot.startsWith("imageModel") || slot.startsWith("imageGenerationModel"))
const looksLikeImage = (model) =>
  /image|flux|qwen|dall|stable|sdxl|seedream|ideogram/i.test(
    `${model.model ?? ""} ${model.display_name ?? ""} ${model.family ?? ""}`,
  )

const image = models.filter((model) => isImageSlot(model) || looksLikeImage(model))

console.log(`catalog ${models.length} models · image-capable ${image.length}\n`)
for (const model of image) {
  const alias = model.model ?? model.id ?? "?"
  const name = model.display_name ?? model.displayName ?? ""
  const selectable = model.selectable === false ? "not selectable" : "selectable"
  const assigned = slots(model).filter((slot) => slot.startsWith("image"))
  console.log(
    `${String(alias).padEnd(38)} ${String(name).padEnd(28)} ${selectable}${
      assigned.length ? `  · ${assigned.join(", ")}` : ""
    }`,
  )
}

if (image.length === 0) {
  console.log("No image-capable rows on this account — try RunningHub for the compose step.")
}
