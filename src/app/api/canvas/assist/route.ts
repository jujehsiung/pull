/**
 * POST /api/canvas/assist — the vision pass that writes the prompt.
 *
 * Body: `{ refs: [{ name, dataUrl }], note? }` where each dataUrl already carries the
 * stylist's border. Returns `{ ok: true, prompt, ms }`, or `{ ok: false, reason }` so the
 * canvas can fall back to its sample output instead of dead-ending a demo.
 */
import { NextResponse } from "next/server"

import { assistPrompt, canvasConfigured, type CanvasRef } from "@/lib/canvas/zoowork-image"

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
  let refs: CanvasRef[]
  let note: string | undefined
  try {
    const body = (await request.json()) as { refs?: unknown; note?: unknown }
    refs = readRefs(body.refs)
    note = typeof body.note === "string" ? body.note.slice(0, 400) : undefined
  } catch (error) {
    return NextResponse.json(
      { ok: false, reason: error instanceof Error ? error.message : "invalid body" },
      { status: 400 },
    )
  }

  try {
    const result = await assistPrompt(refs, note)
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    return NextResponse.json(
      { ok: false, reason: error instanceof Error ? error.message : "assist failed" },
      { status: 502 },
    )
  }
}
