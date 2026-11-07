"use client"

/**
 * Mark up a look — circle the pieces you actually want.
 *
 * A look is a photograph of a whole outfit; a client usually wants one garment
 * out of it. So the brush is not decoration, it is the selection: draw a ring
 * around the jacket and the stylist knows to request the jacket, not the look.
 *
 * Freehand on a canvas over the image, drawn like a marker: a paper halo under
 * a translucent red line, so a ring reads on a white sleeve, a black coat and a
 * lawn alike — and the photograph still shows through the ink.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Eraser, Undo2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { Look } from "@/components/start-job/ReviewBoard"

type Point = { x: number; y: number }

// Marker red: the status red, translucent so the cloth shows through, over a
// paper halo that keeps it legible on any photograph. It marks a photograph,
// never a button — red stays a status colour in the chrome.
const INK = "rgba(179, 38, 30, 0.85)"
const HALO = "rgba(249, 249, 248, 0.9)"
const INK_WIDTH = 5
const HALO_WIDTH = 9

function trace(ctx: CanvasRenderingContext2D, stroke: Point[]) {
  if (stroke.length < 2) {
    const [dot] = stroke
    for (const [style, width] of [
      [HALO, HALO_WIDTH],
      [INK, INK_WIDTH],
    ] as const) {
      ctx.beginPath()
      ctx.arc(dot.x, dot.y, width / 2, 0, Math.PI * 2)
      ctx.fillStyle = style
      ctx.fill()
    }
    return
  }
  for (const [style, width] of [
    [HALO, HALO_WIDTH],
    [INK, INK_WIDTH],
  ] as const) {
    ctx.beginPath()
    ctx.lineJoin = "round"
    ctx.lineCap = "round"
    ctx.strokeStyle = style
    ctx.lineWidth = width
    ctx.moveTo(stroke[0].x, stroke[0].y)
    for (const point of stroke.slice(1)) ctx.lineTo(point.x, point.y)
    ctx.stroke()
  }
}

export function LookMarkupDialog({
  look,
  initial,
  onClose,
  onSave,
}: {
  look: Look | null
  /** Existing markup for this look, a PNG data URL. */
  initial?: string | null
  onClose: () => void
  /** null means no markup: the canvas was cleared. */
  onSave: (dataUrl: string | null) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const boxRef = useRef<HTMLDivElement | null>(null)
  const base = useRef<HTMLImageElement | null>(null)
  const observer = useRef<ResizeObserver | null>(null)
  const strokes = useRef<Point[][]>([])
  const current = useRef<Point[] | null>(null)
  const [hasMarks, setHasMarks] = useState(false)

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    const dpr = window.devicePixelRatio || 1
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr)
    if (base.current) ctx.drawImage(base.current, 0, 0, canvas.width / dpr, canvas.height / dpr)
    for (const stroke of strokes.current) trace(ctx, stroke)
    if (current.current) trace(ctx, current.current)
    setHasMarks(strokes.current.length > 0 || Boolean(base.current))
  }, [])

  /** Size the bitmap to the displayed box so strokes land under the pointer. */
  const fit = useCallback(() => {
    const canvas = canvasRef.current
    const box = boxRef.current
    if (!canvas || !box) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.max(1, Math.round(box.clientWidth * dpr))
    canvas.height = Math.max(1, Math.round(box.clientHeight * dpr))
    canvas.style.width = `${box.clientWidth}px`
    canvas.style.height = `${box.clientHeight}px`
    redraw()
  }, [redraw])

  // Radix mounts the dialog content in its own commit, so an effect keyed on
  // `look` runs before the box exists — hence a callback ref: size the canvas the
  // instant the box attaches, then follow it.
  const attachBox = useCallback(
    (el: HTMLDivElement | null) => {
      observer.current?.disconnect()
      boxRef.current = el
      if (!el) return
      observer.current = new ResizeObserver(() => fit())
      observer.current.observe(el)
      requestAnimationFrame(() => fit())
    },
    [fit],
  )

  // Fresh canvas each time the dialog opens; reload any previous markup as the base.
  useEffect(() => {
    if (!look) return
    strokes.current = []
    current.current = null
    base.current = null
    setHasMarks(false)

    if (!initial) return
    const image = new Image()
    image.onload = () => {
      base.current = image
      redraw()
    }
    image.src = initial
  }, [look, initial, redraw])

  const point = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  const down = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    current.current = [point(event)]
    redraw()
  }
  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!current.current) return
    current.current.push(point(event))
    redraw()
  }
  const up = () => {
    if (current.current && current.current.length) {
      strokes.current.push(current.current)
    }
    current.current = null
    redraw()
  }

  const undo = () => {
    strokes.current.pop()
    redraw()
  }
  const clear = () => {
    strokes.current = []
    current.current = null
    base.current = null
    redraw()
  }

  const save = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (!hasMarks) {
      onSave(null)
      return
    }
    onSave(canvas.toDataURL("image/png"))
  }

  return (
    <Dialog open={Boolean(look)} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="sm:max-w-[760px]">
        <DialogHeader>
          <DialogTitle className="text-[18px]">
            {look ? `${look.brand} · look ${look.lookNo}` : "Mark up"}
          </DialogTitle>
          <DialogDescription>
            Circle the pieces you want. Nothing outside the rings is requested.
          </DialogDescription>
        </DialogHeader>

        <div
          ref={attachBox}
          className="relative mx-auto w-full max-w-[420px] cursor-crosshair touch-none overflow-hidden bg-muted"
        >
          {look?.src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={look.src}
              alt={`${look.brand} look ${look.lookNo}`}
              className="block aspect-[3/4] w-full object-cover"
              draggable={false}
            />
          ) : (
            <div className="aspect-[3/4] w-full" />
          )}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 h-full w-full touch-none"
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            aria-label="Markup canvas"
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={undo} disabled={!hasMarks}>
              <Undo2 className="size-3.5" aria-hidden />
              Undo
            </Button>
            <Button variant="ghost" size="sm" onClick={clear} disabled={!hasMarks}>
              <Eraser className="size-3.5" aria-hidden />
              Clear
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={save}>
              {hasMarks ? "Save markup" : "Done"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
