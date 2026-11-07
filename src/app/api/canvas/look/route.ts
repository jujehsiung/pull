/**
 * POST /api/canvas/look — compose one look from four references.
 *
 * Body: `{ refs: [{ role?, name, dataUrl, markedDataUrl? }], prompt? }`. The vision pass
 * writes the prompt unless one is supplied (a re-run of an edited prompt). Returns
 * `{ ok: true, prompt, promptSource, image, ms }`, or `{ ok: false, reason }` so the canvas
 * can fall back to its sample output instead of dead-ending a demo.
 */
import { NextResponse } from "next/server"

import { canvasConfigured, composeLook, type LookRef } from "@/lib/canvas/zoowork-image"

export const maxDuration = 300

function readRefs(value: unknown): LookRef[] {
  if (!Array.isArray(value)) throw new Error("refs must be an array")
  if (value.length === 0 || value.length > 4) throw new Error("1–4 references are allowed")
  return value.map((entry, index) => {
    const row = entry as { name?: unknown; dataUrl?: unknown; markedDataUrl?: unknown }
    const name = typeof row.name === "string" && row.name.trim() ? row.name.trim() : `reference ${index + 1}`
    const dataUrl = typeof row.dataUrl === "string" ? row.dataUrl : ""
    if (!dataUrl.startsWith("data:image/")) throw new Error(`reference ${index + 1} is not an image`)
    if (dataUrl.length > 8_000_000) throw new Error(`reference ${index + 1} is too large`)
    const markedDataUrl =
      typeof row.markedDataUrl === "string" && row.markedDataUrl.startsWith("data:image/")
        ? row.markedDataUrl
        : undefined
    if (markedDataUrl && markedDataUrl.length > 8_000_000) {
      throw new Error(`reference ${index + 1} marked copy is too large`)
    }
    return { name, dataUrl, markedDataUrl }
  })
}

export async function POST(request: Request) {
  if (!canvasConfigured()) {
    return NextResponse.json({ ok: false, reason: "ZooWork is not configured on this deployment" })
  }

  let refs: LookRef[]
  let prompt: string | undefined
  try {
    const body = (await request.json()) as { refs?: unknown; prompt?: unknown }
    refs = readRefs(body.refs)
    prompt = typeof body.prompt === "string" ? body.prompt.slice(0, 1200) : undefined
  } catch (error) {
    return NextResponse.json(
      { ok: false, reason: error instanceof Error ? error.message : "invalid body" },
      { status: 400 },
    )
  }

  // Stream one NDJSON line per phase, then the result. The phase lines come from the
  // ZooWork session's own progress (tool/lifecycle events), so the card shows the real step.
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (value: unknown) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`))
        } catch {
          // The client walked away; the run keeps going and the artifact is still published.
        }
      }
      try {
        const result = await composeLook(refs, prompt, (phase) => send({ type: "phase", phase }))
        send({ type: "result", ok: true, ...result })
      } catch (error) {
        send({ type: "result", ok: false, reason: error instanceof Error ? error.message : "compose failed" })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  })
}
