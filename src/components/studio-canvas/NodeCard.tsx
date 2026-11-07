"use client"

/**
 * One node on the studio canvas. Square, hairline, mono numbers — the canvas is
 * NERV-shaped: numbered steps, technical labels, nothing rounded.
 *
 * Three kinds carry the whole demo: an image reference (which the stylist can mark),
 * the compose step that reads all four and renders the look, and the save step that
 * writes it into the assets.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent,
} from "react"

import { fileToDataUrl } from "./image-bits"

import { Input } from "@/components/ui/input"
import {
  KIND,
  MAX_NODE_WIDTH,
  MIN_NODE_WIDTH,
  NODE_WIDTH,
  PORTS,
  RUN_MS,
  type CanvasNode,
  type MarkupRect,
} from "./types"

const DOT: Record<CanvasNode["status"], string> = {
  idle: "bg-border",
  running: "bg-brand motion-safe:animate-pulse",
  done: "bg-success",
  failed: "bg-destructive",
}

export interface NodeCardProps {
  node: CanvasNode
  /** 1-based position in the run order. */
  step: number
  selected: boolean
  /** Input ports that already have a wire. */
  wired: Set<string>
  /** `${nodeId}:${portId}` the wire is hovering, if any. */
  highlightPort?: string
  /** Canvas zoom, so a resize drag converts screen pixels to canvas units. */
  zoom: number
  onDisconnect: (id: string, port: string) => void
  onChange: (id: string, patch: Partial<CanvasNode>) => void
  onHeaderDown: (event: PointerEvent<HTMLElement>, node: CanvasNode) => void
  onHeaderMove: (event: PointerEvent<HTMLElement>) => void
  onHeaderUp: (event: PointerEvent<HTMLElement>) => void
  onPortDown: (event: PointerEvent<HTMLElement>, node: CanvasNode) => void
  onPortMove: (event: PointerEvent<HTMLElement>) => void
  onPortUp: (event: PointerEvent<HTMLElement>) => void
  onInputDown: (event: PointerEvent<HTMLElement>, node: CanvasNode, port: string) => void
  onMeasure: (id: string, height: number) => void
  onMeasurePort: (id: string, side: "in" | "out", port: string, x: number, y: number) => void
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

const SOURCE_NOTE: Record<NonNullable<CanvasNode["promptSource"]>, string> = {
  assist: "written by the assistant · editable",
  template: "template prompt · the assistant was unreachable",
  edited: "your prompt · the assistant is skipped",
}

export function NodeCard({
  node,
  step,
  selected,
  wired,
  highlightPort,
  zoom,
  onDisconnect,
  onChange,
  onHeaderDown,
  onHeaderMove,
  onHeaderUp,
  onPortDown,
  onPortMove,
  onPortUp,
  onInputDown,
  onMeasure,
  onMeasurePort,
}: NodeCardProps) {
  const meta = KIND[node.kind]
  const cardRef = useRef<HTMLElement | null>(null)
  const ports = PORTS[node.kind]

  /* ── the stylist's pen ─────────────────────────────────────────────────── */
  const [marking, setMarking] = useState(false)
  const [draft, setDraft] = useState<MarkupRect | null>(null)
  const boxRef = useRef<HTMLDivElement | null>(null)

  const pointIn = (event: PointerEvent<HTMLDivElement>) => {
    const box = boxRef.current?.getBoundingClientRect()
    if (!box) return null
    return {
      x: clamp01((event.clientX - box.left) / box.width),
      y: clamp01((event.clientY - box.top) / box.height),
    }
  }

  const onMarkDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!marking) return
    const point = pointIn(event)
    if (!point) return
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    setDraft({ x: point.x, y: point.y, w: 0, h: 0 })
  }

  const onMarkMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!marking || !draft) return
    const point = pointIn(event)
    if (!point) return
    setDraft({
      x: Math.min(draft.x, point.x),
      y: Math.min(draft.y, point.y),
      w: Math.abs(point.x - draft.x),
      h: Math.abs(point.y - draft.y),
    })
  }

  const onMarkUp = () => {
    if (!marking || !draft) return
    const rect = draft
    setDraft(null)
    if (rect.w < 0.03 || rect.h < 0.03) return
    onChange(node.id, { markup: [...(node.markup ?? []), rect] })
  }

  const measure = useCallback(() => {
    const card = cardRef.current
    if (!card) return
    onMeasure(node.id, card.offsetHeight)
    const cardRect = card.getBoundingClientRect()
    for (const element of card.querySelectorAll<HTMLElement>("[data-port-id]")) {
      const rect = element.getBoundingClientRect()
      const side = element.dataset.portSide === "out" ? "out" : "in"
      onMeasurePort(
        node.id,
        side,
        element.dataset.portId ?? "",
        rect.left - cardRect.left + rect.width / 2,
        rect.top - cardRect.top + rect.height / 2,
      )
    }
  }, [node.id, onMeasure, onMeasurePort])

  // Sockets move when the body grows (a wrapped prompt, a render), so measure after
  // every layout rather than once.
  useLayoutEffect(() => {
    measure()
  })

  useEffect(() => {
    const element = cardRef.current
    if (!element) return
    const observer = new ResizeObserver(() => measure())
    observer.observe(element)
    return () => observer.disconnect()
  }, [measure])

  /* ── resizing the card ─────────────────────────────────────────────────── */
  const width = node.width ?? NODE_WIDTH
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null)

  const clampWidth = (value: number) => Math.round(Math.min(MAX_NODE_WIDTH, Math.max(MIN_NODE_WIDTH, value)))

  const onResizeDown = (event: PointerEvent<HTMLSpanElement>) => {
    event.stopPropagation()
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    resizeRef.current = { startX: event.clientX, startWidth: width }
  }

  const onResizeMove = (event: PointerEvent<HTMLSpanElement>) => {
    const drag = resizeRef.current
    if (!drag) return
    onChange(node.id, { width: clampWidth(drag.startWidth + (event.clientX - drag.startX) / zoom) })
  }

  const onResizeUp = (event: PointerEvent<HTMLSpanElement>) => {
    resizeRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const onResizeKey = (event: ReactKeyboardEvent<HTMLSpanElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
    event.preventDefault()
    onChange(node.id, { width: clampWidth(width + (event.key === "ArrowRight" ? 24 : -24)) })
  }

  /* ── dropping a file from Finder ───────────────────────────────────────── */
  const [dropping, setDropping] = useState(false)

  const acceptsFiles = (event: ReactDragEvent<HTMLElement>) =>
    node.kind === "upload" && Array.from(event.dataTransfer.types).includes("Files")

  const onDragOver = (event: ReactDragEvent<HTMLElement>) => {
    if (!acceptsFiles(event)) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = "copy"
    setDropping(true)
  }

  const onDragLeave = (event: ReactDragEvent<HTMLElement>) => {
    if (node.kind !== "upload") return
    event.stopPropagation()
    const next = event.relatedTarget as Node | null
    if (next && event.currentTarget.contains(next)) return
    setDropping(false)
  }

  const onDrop = async (event: ReactDragEvent<HTMLElement>) => {
    if (node.kind !== "upload") return
    event.preventDefault()
    event.stopPropagation()
    setDropping(false)
    const file = event.dataTransfer.files?.[0]
    if (!file || !file.type.startsWith("image/")) return
    try {
      const dataUrl = await fileToDataUrl(file)
      onChange(node.id, { image: dataUrl, imageLabel: file.name, markup: [] })
    } catch {
      // A file the browser cannot decode leaves the card as it was.
    }
  }

  const markup = node.markup ?? []
  const refsIn = ports.inputs.filter((port) => port.kind === "image" && wired.has(port.id)).length

  return (
    <article
      ref={cardRef}
      data-node-id={node.id}
      style={{ left: node.x, top: node.y, width }}
      aria-label={`${meta.name} card, ${Math.round(width)} wide`}
      onPointerDown={(event) => {
        event.stopPropagation()
        const target = event.target as HTMLElement
        // The card body is a handle too; controls keep their own gestures.
        if (target.closest("button, textarea, input, select, [role='separator'], [data-socket], a")) return
        onHeaderDown(event, node)
      }}
      onPointerMove={onHeaderMove}
      onPointerUp={onHeaderUp}
      onPointerCancel={onHeaderUp}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`pointer-events-auto absolute rounded-lg bg-card transition-colors ${
        node.status === "running"
          ? "border border-brand"
          : node.status === "failed"
            ? "border border-destructive"
            : "border border-border"
      } ${selected ? "outline outline-1 outline-offset-0 outline-foreground/40" : ""}`}
    >
      <div
        onPointerDown={(event) => onHeaderDown(event, node)}
        onPointerMove={onHeaderMove}
        onPointerUp={onHeaderUp}
        onPointerCancel={onHeaderUp}
        className="flex cursor-grab touch-none items-center justify-between gap-2 border-b border-border px-2.5 py-1.5 active:cursor-grabbing"
      >
        <span className="flex items-baseline gap-2">
          <span className="font-mono text-[10px] tracking-[0.02em] text-muted-foreground-soft">
            {String(step).padStart(2, "0")}
          </span>
          <span className="text-[12px] font-medium text-foreground">{meta.name}</span>
        </span>
        <span aria-hidden className={`size-1.5 rounded-full ${DOT[node.status]}`} />
      </div>

      {/* The socket rail: inputs left, outputs right, one row each. */}
      {ports.inputs.length > 0 || ports.outputs.length > 0 ? (
        <div className="flex items-start justify-between gap-3 border-b border-border py-1.5">
          <div className="flex flex-col gap-1">
            {ports.inputs.map((port) => {
              const key = `${node.id}:${port.id}`
              const connected = wired.has(port.id)
              const highlight = highlightPort === key
              return (
                <div
                  key={port.id}
                  data-socket={`${key}:in`}
                  role="button"
                  tabIndex={-1}
                  aria-label={connected ? `Unpick ${port.label}` : `${port.label} socket`}
                  title={connected ? "Drag from it, or click to unpick" : "Drop a wire here"}
                  onPointerDown={(event) => onInputDown(event, node, port.id)}
                  onPointerMove={onPortMove}
                  onPointerUp={onPortUp}
                  onPointerCancel={onPortUp}
                  className="group -ml-[5px] flex cursor-crosshair touch-none items-center gap-1.5 py-[3px]"
                >
                  <span
                    data-port-id={port.id}
                    data-port-side="in"
                    aria-hidden
                    className={`size-2.5 shrink-0 rounded-full border-[1.5px] transition-colors ${
                      highlight
                        ? "border-brand bg-brand"
                        : connected
                          ? "border-foreground bg-foreground"
                          : "border-border bg-card group-hover:border-foreground"
                    }`}
                  />
                  <span
                    className={`font-mono text-[9px] leading-none tracking-[0.02em] transition-colors ${
                      highlight || connected
                        ? "text-foreground"
                        : "text-muted-foreground group-hover:text-foreground"
                    }`}
                  >
                    {port.label}
                  </span>
                </div>
              )
            })}
          </div>

          <div className="flex flex-col items-end gap-1">
            {ports.outputs.map((port) => (
              <div
                key={port.id}
                data-socket={`${node.id}:${port.id}:out`}
                role="button"
                tabIndex={-1}
                aria-label={`Drag a wire from ${port.label}`}
                title="Drag a wire from it"
                onPointerDown={(event) => onPortDown(event, node)}
                onPointerMove={onPortMove}
                onPointerUp={onPortUp}
                onPointerCancel={onPortUp}
                className="group -mr-[5px] flex cursor-crosshair touch-none items-center gap-1.5 py-[3px]"
              >
                <span className="font-mono text-[9px] leading-none tracking-[0.02em] text-muted-foreground group-hover:text-foreground">
                  {port.label}
                </span>
                <span
                  data-port-id={port.id}
                  data-port-side="out"
                  aria-hidden
                  className={`size-2.5 shrink-0 rounded-full border-[1.5px] transition-colors ${
                    highlightPort === `${node.id}:${port.id}`
                      ? "border-brand bg-brand"
                      : "border-foreground bg-card group-hover:bg-foreground"
                  }`}
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {node.kind === "upload" ? (
        <div className="p-2.5">
          <div
            ref={boxRef}
            data-markup-box
            onPointerDown={onMarkDown}
            onPointerMove={onMarkMove}
            onPointerUp={onMarkUp}
            onPointerCancel={onMarkUp}
            className={`relative aspect-square w-full touch-none overflow-hidden rounded-md border border-border bg-muted ${
              marking ? "cursor-crosshair" : ""
            }`}
          >
            {node.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={node.image} alt="" draggable={false} className="size-full object-cover object-top" />
            ) : (
              <div className="flex size-full items-center justify-center text-[11px] text-muted-foreground-soft">
                drop an image
              </div>
            )}

            {[...markup, ...(draft ? [draft] : [])].map((rect, index) => (
              <span
                key={index}
                aria-hidden
                className="pointer-events-none absolute border-2 border-destructive bg-destructive/10"
                style={{
                  left: `${rect.x * 100}%`,
                  top: `${rect.y * 100}%`,
                  width: `${rect.w * 100}%`,
                  height: `${rect.h * 100}%`,
                }}
              />
            ))}

            {marking ? (
              <span className="pointer-events-none absolute inset-x-0 top-0 bg-destructive/90 px-1.5 py-0.5 font-mono text-[9px] text-background">
                draw a red border around what you mean
              </span>
            ) : null}

            {dropping ? (
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center border-2 border-dashed border-destructive bg-background/80 px-2 text-center font-mono text-[10px] text-destructive">
                drop to replace
              </span>
            ) : null}
          </div>

          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="min-w-0 truncate font-mono text-[10px] tracking-[0.02em] text-muted-foreground-soft">
              {node.imageLabel ?? node.image?.split("/").pop() ?? "—"}
            </span>
            <span className="flex shrink-0 items-center gap-1">
              {markup.length > 0 ? (
                <button
                  type="button"
                  onClick={() => onChange(node.id, { markup: [] })}
                  className="rounded-md px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  clear
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setMarking((value) => !value)}
                aria-pressed={marking}
                className={`rounded-md border px-1.5 py-0.5 font-mono text-[10px] ${
                  marking
                    ? "border-destructive bg-destructive text-background"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {marking ? "done" : markup.length > 0 ? `marked ${markup.length}` : "mark"}
              </button>
            </span>
          </div>
        </div>
      ) : null}

      {node.kind === "compose" ? (
        <div className="p-2.5">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] text-muted-foreground">References</span>
            <span className="font-mono text-[10px] tabular-nums text-foreground">{refsIn} / 4</span>
          </div>

          <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground-soft">
            no roles to fill in — the assistant reads each picture and the red border you drew.
          </p>

          <label className="mt-2.5 block text-[11px] text-muted-foreground" htmlFor={`${node.id}-prompt`}>
            Prompt
          </label>
          <textarea
            id={`${node.id}-prompt`}
            value={node.prompt ?? ""}
            onChange={(event) => onChange(node.id, { prompt: event.target.value, promptSource: "edited" })}
            rows={4}
            spellCheck={false}
            placeholder="Run once: the assistant writes it here. Edit it and run again to re-render without the assistant."
            className="mt-1 w-full resize-none rounded-md border border-border bg-background px-1.5 py-1 text-[11px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground-soft"
          />
          <p className="mt-1 font-mono text-[9px] leading-relaxed text-muted-foreground-soft">
            {node.prompt ? SOURCE_NOTE[node.promptSource ?? "assist"] : "gpt-image-2 · reads the four refs"}
          </p>

          {node.output ? (
            <div className="mt-2 aspect-square w-full overflow-hidden rounded-sm border border-border bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={node.output} alt="" className="size-full object-cover object-top" />
            </div>
          ) : null}
        </div>
      ) : null}

      {node.kind === "save" ? (
        <div className="p-2.5">
          <label className="block text-[11px] text-muted-foreground" htmlFor={`${node.id}-filename`}>
            Filename
          </label>
          <Input
            id={`${node.id}-filename`}
            value={node.filename ?? ""}
            onChange={(event) => onChange(node.id, { filename: event.target.value })}
            className="mt-1 h-7 border-border px-1.5 font-mono text-[11px]"
          />
          {node.output ? (
            <div className="mt-2 aspect-square w-full overflow-hidden border border-border bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={node.output} alt="" className="size-full object-cover object-top" />
            </div>
          ) : null}
          <p className="mt-2 font-mono text-[10px] tracking-[0.02em] text-muted-foreground-soft">
            {node.output ? "1 image · in the assets" : "goes to the studio assets"}
          </p>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2 border-t border-border px-2.5 py-1">
        <span className="truncate text-[10px] text-muted-foreground-soft" title={node.error}>
          {node.status === "failed" && node.error ? node.error : meta.note}
        </span>
        <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground-soft">
          {node.status === "done" && node.durationMs
            ? `${(node.durationMs / 1000).toFixed(1)}s`
            : node.status === "running"
              ? "…"
              : node.status === "failed"
                ? "failed"
                : `${(RUN_MS[node.kind] / 1000).toFixed(0)}s`}
        </span>
      </div>

      {/* The resize grip: drag the corner, or focus it and use ← →. */}
      <span
        role="separator"
        aria-label="Resize card"
        aria-orientation="horizontal"
        tabIndex={0}
        title="Drag to resize the card"
        onPointerDown={onResizeDown}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeUp}
        onPointerCancel={onResizeUp}
        onKeyDown={onResizeKey}
        className="absolute bottom-0 right-0 z-10 flex size-5 cursor-nwse-resize touch-none items-end justify-end p-1 text-muted-foreground-soft hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span aria-hidden className="size-2 border-b border-r border-current" />
      </span>
    </article>
  )
}
