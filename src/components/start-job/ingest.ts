"use client"

/**
 * Ingest one look — crop it, read it, identify it.
 *
 * WHY THIS IS IN THE BROWSER
 * The production pipeline crops through Cloudinary (`BOARD_TRANSFORM`:
 * `e_trim:20,c_fill,w_1200,h_1600,g_auto`) and reads the caption with
 * tesseract.js in the stylist's browser. There is no Cloudinary key in this
 * build, so the crop is done on a canvas instead — same intent, same output
 * shape (a 3:4 board tile), no vendor. When Cloudinary is connected this file
 * should call the transform and drop the canvas path.
 *
 * READING THE CAPTION
 * `readCaption()` is the seam for the vision model Juje wants. DeepSeek's
 * platform API has no vision endpoint and ZooWork's model access arrives with
 * the credits, so today it falls back to tesseract.js + the app's own parser —
 * which is a real read of the pixels, not a filename guess, whenever the
 * screenshot prints its caption. The cropped image is already a Blob, so
 * swapping in a VL call means replacing one function body.
 *
 * Every step is timed and returned, because the app's claim is that nothing the
 * agent does is silent (PRD §7.1, FR-23).
 */
import { ocrImage } from "@/lib/agent/ocr"
import { parseLook, type ParsedLook } from "@/lib/agent/parse"

export interface IngestStep {
  tool: string
  ms: number
  status: "ok" | "error"
  note?: string
}

export interface IngestInput {
  /** A file from the stylist's folder, or a URL for a seeded suggestion. */
  source: File | string
  fileName: string
  /** Known metadata (seeded suggestions) — skips the read, keeps the crop. */
  known?: { brand: string; lookNo: number; season: string | null }
}

export interface IngestedLook {
  /** Cropped 3:4 preview, as an object URL. */
  src: string
  width: number
  height: number
  /** Share of the original frame the crop discarded, 0–1. */
  removed: number
  brand: string
  lookNo: number
  season: string | null
  confidence: number
  /** Where the identity came from. */
  readSource: ParsedLook["readSource"] | "suggestion"
  steps: IngestStep[]
}

const BOARD_WIDTH = 900
const BOARD_HEIGHT = 1200 // 3:4, the board tile
const LOOK_ASPECT = BOARD_WIDTH / BOARD_HEIGHT

const now = () => (typeof performance === "undefined" ? Date.now() : performance.now())

async function toBitmap(source: File | string): Promise<ImageBitmap> {
  if (typeof source === "string") {
    const response = await fetch(source)
    if (!response.ok) throw new Error(`could not fetch ${source}`)
    return createImageBitmap(await response.blob())
  }
  return createImageBitmap(source)
}

/**
 * Read the caption off the image.
 *
 * SEAM: replace the body with the VL provider call when a vision model is
 * connected. Keep the return shape — the parser and the UI both depend on it.
 */
/**
 * tesseract reads noise off a photograph with no caption and still scores it.
 * Handing that noise to the parser invents houses — a run on a runway photo
 * produced the brand "LL" from two stray letters. Below this confidence the
 * text is treated as unread, so the identity falls back to what the file name
 * actually says instead of to a guess.
 */
const MIN_READ_CONFIDENCE = 60

async function readCaption(blob: Blob): Promise<{ text: string; confidence: number; via: "tesseract" }> {
  const read = await ocrImage(blob, { timeoutMs: 20_000 })
  const trusted = read.confidence >= MIN_READ_CONFIDENCE
  return { text: trusted ? read.text : "", confidence: read.confidence, via: "tesseract" }
}

/**
 * Find the content rect inside a screenshot.
 *
 * A camera-roll screencap is mostly not the look: status bar, app chrome, a
 * caption strip, white letterboxing. Production runs `e_trim:20` to strip the
 * uniform border; this is the local equivalent. It walks in from each edge
 * while the line is uniform (one flat colour, within a tolerance) and stops at
 * the first line that is not — which is where the photograph starts.
 *
 * Uniformity is measured on a downscaled copy, because a border test does not
 * need full resolution and this runs per image in the browser.
 */
const TRIM_SAMPLE_WIDTH = 240
const TRIM_TOLERANCE = 10 // max channel spread, 0–255, for a line to count as flat
const MIN_KEPT = 0.3 // refuse a trim that would throw away 70%+ of the frame

function contentBounds(bitmap: ImageBitmap): { x: number; y: number; w: number; h: number } {
  const scale = Math.min(1, TRIM_SAMPLE_WIDTH / bitmap.width)
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  if (!ctx) return { x: 0, y: 0, w: bitmap.width, h: bitmap.height }
  ctx.drawImage(bitmap, 0, 0, w, h)
  const { data } = ctx.getImageData(0, 0, w, h)

  const at = (x: number, y: number) => (y * w + x) * 4
  const isFlat = (samples: number[][]) => {
    for (let c = 0; c < 3; c++) {
      let min = 255
      let max = 0
      for (const s of samples) {
        if (s[c] < min) min = s[c]
        if (s[c] > max) max = s[c]
      }
      if (max - min > TRIM_TOLERANCE) return false
    }
    return true
  }

  const row = (y: number) => Array.from({ length: w }, (_, x) => [data[at(x, y)], data[at(x, y) + 1], data[at(x, y) + 2]])
  const col = (x: number) => Array.from({ length: h }, (_, y) => [data[at(x, y)], data[at(x, y) + 1], data[at(x, y) + 2]])

  let top = 0
  let bottom = h - 1
  let left = 0
  let right = w - 1
  while (top < bottom && isFlat(row(top))) top++
  while (bottom > top && isFlat(row(bottom))) bottom--
  while (left < right && isFlat(col(left))) left++
  while (right > left && isFlat(col(right))) right--

  const keptW = right - left + 1
  const keptH = bottom - top + 1
  if (keptW < w * MIN_KEPT || keptH < h * MIN_KEPT) {
    return { x: 0, y: 0, w: bitmap.width, h: bitmap.height }
  }
  const ratio = bitmap.width / w
  return {
    x: Math.round(left * ratio),
    y: Math.round(top * ratio),
    w: Math.max(1, Math.round(keptW * ratio)),
    h: Math.max(1, Math.round(keptH * ratio)),
  }
}

export async function ingestLook(input: IngestInput): Promise<IngestedLook> {
  const steps: IngestStep[] = []

  // ── crop to the board tile ────────────────────────────────────────────────
  const cropStart = now()
  let bitmap: ImageBitmap
  try {
    bitmap = await toBitmap(input.source)
  } catch (error) {
    steps.push({
      tool: "canvas.decode",
      ms: Math.round(now() - cropStart),
      status: "error",
      note: error instanceof Error ? error.message : "decode failed",
    })
    throw Object.assign(new Error("That image could not be opened."), { steps })
  }

  const sourceW = bitmap.width
  const sourceH = bitmap.height

  // 1. strip whatever the screenshot wrapped the look in
  const trim = contentBounds(bitmap)
  const trimmedShare = 1 - (trim.w * trim.h) / (sourceW * sourceH)

  // 2. take the 3:4 board tile out of what is left
  const trimmedAspect = trim.w / trim.h
  let cropW = trim.w
  let cropH = trim.h
  if (trimmedAspect > LOOK_ASPECT) {
    cropW = Math.round(trim.h * LOOK_ASPECT)
  } else {
    cropH = Math.round(trim.w / LOOK_ASPECT)
  }
  const cropX = trim.x + Math.round((trim.w - cropW) / 2)
  const cropY = trim.y + Math.round((trim.h - cropH) / 2)

  const canvas = document.createElement("canvas")
  canvas.width = BOARD_WIDTH
  canvas.height = BOARD_HEIGHT
  const context = canvas.getContext("2d")
  if (!context) throw new Error("This browser cannot crop images.")
  context.imageSmoothingQuality = "high"
  context.drawImage(bitmap, cropX, cropY, cropW, cropH, 0, 0, BOARD_WIDTH, BOARD_HEIGHT)
  bitmap.close?.()

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86))
  if (!blob) throw new Error("The crop could not be written.")
  const removed = Math.max(0, 1 - (cropW * cropH) / (sourceW * sourceH))
  steps.push({
    tool: "canvas.trim",
    ms: Math.max(0, Math.round(now() - cropStart) - 0),
    status: "ok",
    note: `border stripped ${Math.round(trimmedShare * 100)}% · kept ${trim.w}×${trim.h}`,
  })
  steps.push({
    tool: "canvas.crop",
    ms: 0,
    status: "ok",
    note: `3:4 · ${BOARD_WIDTH}×${BOARD_HEIGHT} · removed ${Math.round(removed * 100)}% of the frame`,
  })

  // ── identify: known metadata, or read the pixels ──────────────────────────
  if (input.known) {
    steps.push({ tool: "agent.identify", ms: 0, status: "ok", note: "seeded suggestion" })
    return {
      src: URL.createObjectURL(blob),
      width: BOARD_WIDTH,
      height: BOARD_HEIGHT,
      removed,
      brand: input.known.brand,
      lookNo: input.known.lookNo,
      season: input.known.season,
      confidence: 0.99,
      readSource: "suggestion",
      steps,
    }
  }

  const readStart = now()
  try {
    const read = await readCaption(blob)
    const parsed = parseLook(read.text, input.fileName, 1)
    steps.push({
      tool: "tesseract.read",
      ms: Math.round(now() - readStart),
      status: "ok",
      note: read.text.trim()
        ? `${read.text.trim().slice(0, 48).replace(/\s+/g, " ")}… · ${Math.round(read.confidence)}%`
        : `nothing legible (${Math.round(read.confidence)}%)${read.confidence < MIN_READ_CONFIDENCE ? " — discarded" : ""}`,
    })
    steps.push({
      tool: "agent.parse",
      ms: 0,
      status: "ok",
      note: `${parsed.brand} · look ${parsed.lookNo} · ${parsed.season ?? "no season"} (from ${parsed.readSource})`,
    })
    return {
      src: URL.createObjectURL(blob),
      width: BOARD_WIDTH,
      height: BOARD_HEIGHT,
      removed,
      brand: parsed.brand,
      lookNo: parsed.lookNo,
      season: parsed.season,
      confidence: parsed.confidence,
      readSource: parsed.readSource,
      steps,
    }
  } catch (error) {
    // A failed read is not a failed look: the crop is still usable, so the
    // stylist keeps the tile and the parser falls back to the filename.
    steps.push({
      tool: "tesseract.read",
      ms: Math.round(now() - readStart),
      status: "error",
      note: error instanceof Error ? error.message : "read failed",
    })
    const parsed = parseLook("", input.fileName, 1)
    return {
      src: URL.createObjectURL(blob),
      width: BOARD_WIDTH,
      height: BOARD_HEIGHT,
      removed,
      brand: parsed.brand,
      lookNo: parsed.lookNo,
      season: parsed.season,
      confidence: parsed.confidence,
      readSource: parsed.readSource,
      steps,
    }
  }
}
