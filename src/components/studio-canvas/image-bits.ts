/** Turning reference images into payloads for the canvas's model calls. */
import type { MarkupRect } from "./types"

/**
 * Load, downscale and (when asked) draw the stylist's borders onto the copy that goes
 * to the vision pass. The edit pass gets the clean copy — a border baked into a
 * reference would be carried into the render.
 */
export async function imageDataUrl(
  src: string,
  options: { maxSize?: number; markup?: MarkupRect[]; overlay?: string } = {},
): Promise<string> {
  const { maxSize = 1024, markup = [], overlay } = options
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

  if (overlay) {
    // The client's markup is already a picture; draw it over the copy at the same scale.
    try {
      const layer = await load(overlay)
      context.drawImage(layer, 0, 0, width, height)
    } catch {
      // A markup layer that cannot decode must not stop the read.
    }
  }

  if (markup.length > 0) {
    context.strokeStyle = "#465907"
    context.lineWidth = Math.max(3, Math.round(width * 0.006))
    for (const rect of markup) {
      context.strokeRect(rect.x * width, rect.y * height, rect.w * width, rect.h * height)
    }
  }

  return canvas.toDataURL("image/jpeg", 0.86)
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
    return result ?? failure("the stream was cut off before the result — run again")
  } catch (error) {
    return failure(error instanceof Error ? error.message : "network error")
  }
}
