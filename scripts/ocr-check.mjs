#!/usr/bin/env node
/**
 * PRD FR-4 acceptance gate: read the 10 fixture screenshots with the SAME browser OCR and the
 * SAME `parseLook()` the import pipeline uses, then check the look number and season against the
 * ground truth encoded in the fixture filenames.
 *
 * FR-4: "on the 10-image fixture set, ≥ 9 look numbers and ≥ 9 seasons are correct."
 * Node-only on purpose: it proves parse accuracy without a browser or a Cloudinary upload. The
 * real import runs tesseract.js in the stylist's browser (src/lib/agent/ocr.ts).
 *
 *   npm run ocr:check
 *   npm run ocr:check -- --verbose     # also print the OCR text per fixture
 */
import { existsSync, mkdirSync, readdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { createWorker } from "tesseract.js"
import { canonicalBrand, parseLook } from "../src/lib/agent/parse.ts"

const root = resolve(import.meta.dirname, "..")
const fixtureDir = resolve(root, "../agent-board/fixtures/looks")
const GATE = 9
const EXPECTED_FILES = 10
const verbose = process.argv.includes("--verbose")

if (!existsSync(fixtureDir)) {
  console.error(`\nocr:check — fixture folder not found: ${fixtureDir}`)
  console.error("The PRD fixture set lives at ../agent-board/fixtures/looks (COPYING.md).\n")
  process.exit(1)
}

const files = readdirSync(fixtureDir)
  .filter((file) => /\.(png|jpe?g|webp)$/i.test(file))
  .sort()

/** Ground truth is encoded in the sample filenames: `celine_look_27_aw26.png`. */
function expectedFromFilename(filename) {
  const look = filename.match(/look[_-]?(\d{1,3})/i)
  const season = filename.match(/[_-](aw|fw|ss|pf|resort)(\d{2})(?=[._-]|$)/i)
  const brandPart = filename
    .replace(/\.[a-z0-9]+$/i, "")
    .split(/look[_-]?\d/i)[0]
    .replace(/[_-]+/g, " ")
    .trim()
  return {
    lookNo: look ? Number(look[1]) : NaN,
    season: season ? `${season[1].toUpperCase()}${season[2]}` : "",
    brand: canonicalBrand(brandPart),
  }
}

function pad(value, width) {
  const text = String(value)
  return text.length >= width ? text.slice(0, width) : text + " ".repeat(width - text.length)
}

const cachePath = resolve(tmpdir(), "pull-ocr-check-tessdata")
mkdirSync(cachePath, { recursive: true })

if (files.length !== EXPECTED_FILES) {
  console.warn(
    `\nocr:check — expected ${EXPECTED_FILES} fixtures in ${fixtureDir}, found ${files.length}. Scoring against what is there.`,
  )
}

console.log(`\nPULL — FR-4 look extraction (tesseract.js in Node, parseLook from src/lib/agent/parse.ts)`)
console.log(`fixtures: ${fixtureDir}\n`)

const worker = await createWorker("eng", 1, { cachePath, logger: () => {} })
const startedAll = Date.now()
const rows = []

try {
  for (const [index, file] of files.entries()) {
    const expected = expectedFromFilename(file)
    const started = Date.now()
    let ocr = { text: "", confidence: 0 }
    let error = null
    try {
      const result = await worker.recognize(resolve(fixtureDir, file))
      ocr = { text: result.data.text ?? "", confidence: Math.round(result.data.confidence ?? 0) }
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause)
    }
    const parsed = parseLook(ocr.text, file, index + 1)
    rows.push({
      file,
      expected,
      parsed,
      ocr,
      error,
      ms: Date.now() - started,
      lookOk: parsed.lookNo === expected.lookNo,
      seasonOk: (parsed.season ?? "") === expected.season,
      brandOk: parsed.brand === expected.brand,
    })
  }
} finally {
  await worker.terminate()
}

const WIDTHS = { file: 36, look: 12, season: 12, brand: 22, read: 10, conf: 6, ms: 6 }

console.log(
  pad("fixture", WIDTHS.file) +
    pad("look", WIDTHS.look) +
    pad("season", WIDTHS.season) +
    pad("brand", WIDTHS.brand) +
    pad("read", WIDTHS.read) +
    pad("conf", WIDTHS.conf) +
    pad("ms", WIDTHS.ms),
)
console.log("─".repeat(104))
for (const row of rows) {
  const lookCell = `${row.expected.lookNo}${row.lookOk ? " ✓" : ` ✗ ${row.parsed.lookNo}`}`
  const seasonCell = `${row.expected.season || "—"}${row.seasonOk ? " ✓" : ` ✗ ${row.parsed.season ?? "—"}`}`
  const brandCell = `${row.brandOk ? "✓" : "✗"} ${row.parsed.brand}`
  console.log(
    pad(row.file, WIDTHS.file) +
      pad(lookCell, WIDTHS.look) +
      pad(seasonCell, WIDTHS.season) +
      pad(brandCell, WIDTHS.brand) +
      pad(row.parsed.readSource, WIDTHS.read) +
      pad(row.ocr.confidence, WIDTHS.conf) +
      pad(row.ms, WIDTHS.ms),
  )
  if (row.error) console.log(`  ! OCR failed: ${row.error}`)
  if (verbose) console.log(`  text: ${JSON.stringify(row.ocr.text)}`)
}

const lookPass = rows.filter((row) => row.lookOk).length
const seasonPass = rows.filter((row) => row.seasonOk).length
const brandPass = rows.filter((row) => row.brandOk).length
const imageRead = rows.filter((row) => row.parsed.readSource === "image").length
const total = rows.length
const seconds = ((Date.now() - startedAll) / 1000).toFixed(1)

console.log("\n" + "─".repeat(88))
console.log(`look numbers   ${lookPass}/${total}   (gate: ≥ ${GATE}/10)  ${lookPass >= GATE ? "PASS" : "FAIL"}`)
console.log(`seasons        ${seasonPass}/${total}   (gate: ≥ ${GATE}/10)  ${seasonPass >= GATE ? "PASS" : "FAIL"}`)
console.log(`brands         ${brandPass}/${total}   (reported, not gated)`)
console.log(`read from image ${imageRead}/${total}  (rest fall back to filename/sequence, flagged)`)
console.log(`10 fixtures in ${seconds} s\n`)

if (files.length !== EXPECTED_FILES) {
  console.error("ocr:check — wrong fixture count, the FR-4 gate is scored on the 10-image PRD set.\n")
  process.exit(1)
}
if (lookPass < GATE || seasonPass < GATE) {
  console.error("ocr:check — FR-4 gate FAILED (need ≥ 9 look numbers and ≥ 9 seasons).\n")
  process.exit(1)
}

console.log("ocr:check — FR-4 gate PASS.\n")
