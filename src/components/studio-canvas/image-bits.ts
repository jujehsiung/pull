/** Turning reference images into payloads for the canvas's model calls. */
import type { MarkupRect } from "./types"

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

/** POST JSON and normalise the two failure shapes the canvas understands. */
export async function postJson<T extends { ok: boolean }>(url: string, body: unknown): Promise<T> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
    const payload = (await response.json()) as T
    if (!response.ok && payload.ok !== false) {
      return { ok: false, reason: `HTTP ${response.status}` } as unknown as T
    }
    return payload
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "network error" } as unknown as T
  }
}
