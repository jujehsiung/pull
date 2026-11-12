/** Turning reference images into payloads for the canvas's model calls. */
import type { MarkupRect } from "./types"
import type { PieceBox } from "@/lib/demo-session"

/** The client view the boxes were drawn on. */
const CLIENT_ASPECT = 3 / 4

/**
 * Load, downscale and (when asked) draw the stylist's borders onto the copy that goes
 * to the vision pass. The edit pass gets the clean copy — a border baked into a
 * reference would be carried into the render.
 */
export async function imageDataUrl(
  src: string,
  options: { maxSize?: number; markup?: MarkupRect[] } = {},
): Promise<string> {
  const { maxSize = 1024, markup = [] } = options
  const image = await load(src)
  const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight))
  const width = Math.max(1, Math.round(image.naturalWidth * scale))
  const height = Math.max(1, Math.round(image.naturalHeight * scale))

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d")
  if (!context) throw new Error("this browser cannot read images onto a canvas")
  context.drawImage(image, 0, 0, width, height)

  if (markup.length > 0) {
    context.strokeStyle = "#465907"
    context.lineWidth = Math.max(3, Math.round(width * 0.006))
    for (const rect of markup) {
      context.strokeRect(rect.x * width, rect.y * height, rect.w * width, rect.h * height)
    }
  }

  return canvas.toDataURL("image/jpeg", 0.86)
}


/**
 * The rectangle of the source photo that the client's 3:4 view actually shows — the page
 * displays the look with object-fit: cover, so a ring's coordinates are relative to that crop.
 */
function coveredSource(srcWidth: number, srcHeight: number) {
  if (srcWidth / srcHeight > CLIENT_ASPECT) {
    const width = srcHeight * CLIENT_ASPECT
    return { x: (srcWidth - width) / 2, y: 0, w: width, h: srcHeight }
  }
  const height = srcWidth / CLIENT_ASPECT
  return { x: 0, y: (srcHeight - height) / 2, w: srcWidth, h: height }
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

/** Crop one circled piece out of the clean look, padded so the whole garment is inside. */
export async function cropPiece(src: string, box: PieceBox): Promise<string> {
  const image = await load(src)
  const visible = coveredSource(image.naturalWidth, image.naturalHeight)
  const padX = box.w * 0.05
  const padY = box.h * 0.05
  const left = clamp01(box.x - padX)
  const top = clamp01(box.y - padY)
  const right = clamp01(box.x + box.w + padX)
  const bottom = clamp01(box.y + box.h + padY)
  const widthRatio = Math.max(0.03, right - left)
  const heightRatio = Math.max(0.03, bottom - top)

  const canvas = document.createElement("canvas")
  canvas.width = Math.min(900, Math.max(64, Math.round(visible.w * widthRatio)))
  canvas.height = Math.min(1200, Math.max(64, Math.round(visible.h * heightRatio)))
  const context = canvas.getContext("2d")
  if (!context) throw new Error("this browser cannot crop the pieces")
  context.drawImage(
    image,
    visible.x + left * visible.w,
    visible.y + top * visible.h,
    visible.w * widthRatio,
    visible.h * heightRatio,
    0,
    0,
    canvas.width,
    canvas.height,
  )
  return canvas.toDataURL("image/jpeg", 0.92)
}

interface Cell {
  x: number
  y: number
  w: number
  h: number
}

/** A flat-lay layout: separate pieces, each in its own rectangle, never merged. */
function collageCells(count: number, width: number, height: number, margin: number, gap: number): Cell[] {
  const left = margin
  const top = margin
  const contentWidth = width - margin * 2
  const contentHeight = height - margin * 2
  if (count <= 1) return [{ x: left, y: top, w: contentWidth, h: contentHeight }]
  if (count === 2) {
    const w = (contentWidth - gap) / 2
    return [
      { x: left, y: top, w, h: contentHeight },
      { x: left + w + gap, y: top, w, h: contentHeight },
    ]
  }
  if (count === 3) {
    const bigWidth = Math.round((contentWidth - gap) * 0.58)
    const smallWidth = contentWidth - gap - bigWidth
    const half = (contentHeight - gap) / 2
    return [
      { x: left, y: top, w: bigWidth, h: contentHeight },
      { x: left + bigWidth + gap, y: top, w: smallWidth, h: half },
      { x: left + bigWidth + gap, y: top + half + gap, w: smallWidth, h: half },
    ]
  }
  const w = (contentWidth - gap) / 2
  const h = (contentHeight - gap) / 2
  return [
    { x: left, y: top, w, h },
    { x: left + w + gap, y: top, w, h },
    { x: left, y: top + h + gap, w, h },
    { x: left + w + gap, y: top + h + gap, w, h },
  ]
}

/**
 * The mockup as a styling collage: every piece is drawn as itself, in its own rectangle,
 * arranged like a flat lay. Nothing is generated, so nothing is mashed into a new garment.
 */
export async function collageDataUrl(sources: string[]): Promise<string> {
  const images = (await Promise.all(sources.map((src) => load(src)))).slice(0, 4)
  if (!images.length) throw new Error("no pieces to collage")
  const width = 1200
  const height = 1500
  const margin = 64
  const gap = 28
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d")
  if (!context) throw new Error("this browser cannot build the collage")
  context.fillStyle = "#f7f5f1"
  context.fillRect(0, 0, width, height)

  const cells = collageCells(images.length, width, height, margin, gap)
  images.forEach((image, index) => {
    const cell = cells[index]
    const scale = Math.min(cell.w / image.naturalWidth, cell.h / image.naturalHeight)
    const drawWidth = image.naturalWidth * scale
    const drawHeight = image.naturalHeight * scale
    const x = cell.x + (cell.w - drawWidth) / 2
    const y = cell.y + (cell.h - drawHeight) / 2
    context.drawImage(image, x, y, drawWidth, drawHeight)
    context.strokeStyle = "rgba(10, 10, 10, 0.10)"
    context.lineWidth = 1
    context.strokeRect(x + 0.5, y + 0.5, drawWidth - 1, drawHeight - 1)
  })

  return canvas.toDataURL("image/jpeg", 0.92)
}

/** A file the stylist dragged in from Finder, ready for a card: downscaled data URL. */
export async function fileToDataUrl(file: File, maxSize = 1400): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    return await imageDataUrl(url, { maxSize })
  } finally {
    URL.revokeObjectURL(url)
  }
}

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = "anonymous"
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`could not load ${src}`))
    image.src = src
  })
}

/** One line of the compose route's NDJSON progress stream. */
export interface LookStreamEvent {
  type: "phase" | "result"
  phase?: string
}

/**
 * POST and read the response as NDJSON. The compose route sends one `phase` line per step
 * (the ZooWork session's own tool/lifecycle events, forwarded) and one final `result` line.
 */
export async function streamJson<T extends { ok: boolean }>(
  url: string,
  body: unknown,
  onEvent: (event: LookStreamEvent) => void,
): Promise<T> {
  const failure = (reason: string) => ({ ok: false, reason }) as unknown as T
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!response.ok || !response.body) {
      const payload = (await response.json().catch(() => null)) as T | null
      return payload ?? failure(`HTTP ${response.status}`)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    let result: T | null = null

    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let newline = buffer.indexOf("\n")
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim()
        buffer = buffer.slice(newline + 1)
        newline = buffer.indexOf("\n")
        if (!line) continue
        const event = JSON.parse(line) as LookStreamEvent & Record<string, unknown>
        if (event.type === "phase") onEvent(event)
        else if (event.type === "result") {
          const { type: _type, ...rest } = event
          result = rest as unknown as T
        }
      }
    }
    return result ?? failure("the run ended without a result")
  } catch (error) {
    return failure(error instanceof Error ? error.message : "network error")
  }
}
