/**
 * POST /api/canvas/render — one gpt-image-2 edit, returned as a data URL.
 *
 * Body: `{ prompt, refs: [{ name, dataUrl }], model? }`. The references are the clean
 * images (no borders): the borders were for the vision pass, not the edit.
 */
import { NextResponse } from "next/server"

import { canvasConfigured, renderLook, type CanvasRef } from "@/lib/canvas/zoowork-image"

export const maxDuration = 300

function readRefs(value: unknown): CanvasRef[] {
  if (!Array.isArray(value)) throw new Error("refs must be an array")
  const refs = value.map((entry, index) => {
    const row = entry as { name?: unknown; dataUrl?: unknown }
    const name = typeof row.name === "string" && row.name.trim() ? row.name.trim() : `reference ${index + 1}`
    const dataUrl = typeof row.dataUrl === "string" ? row.dataUrl : ""
    if (!dataUrl.startsWith("data:image/")) throw new Error(`reference ${index + 1} is not an image`)
    if (dataUrl.length > 8_000_000) throw new Error(`reference ${index + 1} is too large`)
    return { name, dataUrl }
  })
  if (refs.length === 0 || refs.length > 5) throw new Error("1–5 references are allowed")
  return refs
}

export async function POST(request: Request) {
  if (!canvasConfigured()) {
    return NextResponse.json({ ok: false, reason: "ZooWork is not configured on this deployment" })
  }
  let prompt: string
  let refs: CanvasRef[]
  let model: string | undefined
  try {
    const body = (await request.json()) as { prompt?: unknown; refs?: unknown; model?: unknown }
    if (typeof body.prompt !== "string" || body.prompt.trim().length < 10) {
      throw new Error("prompt is too short")
    }
    prompt = body.prompt.trim().slice(0, 1200)
    refs = readRefs(body.refs)
    model = typeof body.model === "string" && body.model.startsWith("litellm/") ? body.model : undefined
  } catch (error) {
    return NextResponse.json(
      { ok: false, reason: error instanceof Error ? error.message : "invalid body" },
      { status: 400 },
    )
  }

  try {
    const result = await renderLook(prompt, refs, model)
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    return NextResponse.json(
      { ok: false, reason: error instanceof Error ? error.message : "render failed" },
      { status: 502 },
    )
  }
}
