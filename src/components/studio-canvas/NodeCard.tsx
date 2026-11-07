"use client"

/**
 * One node on the studio canvas. Square, hairline, mono numbers — the canvas is
 * NERV-shaped: numbered steps, technical labels, nothing rounded.
 *
 * The socket rail is the node's interface, ComfyUI-style but drawn in Pull's
 * language: every input is a labelled square on the left edge, every output a labelled
 * square on the right. The body is the setting for that step.
 *
 * The image node carries the stylist's pen: press **mark**, drag a border around the
 * object that matters, and the border is baked into the copy the vision pass reads.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from "react"

import { Input } from "@/components/ui/input"
import {
  ASSIST_REFS,
  KIND,
  MAX_REFS,
  MODELS,
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
  /** Images on the edit step's five reference sockets, in order. */
  refImages: (string | undefined)[]
  /** Text arriving on the edit step's prompt socket. */
  promptText?: string
  /** `${nodeId}:${portId}` the wire is hovering, if any. */
  highlightPort?: string
  /** Drop the wire on this input socket. */
  onDisconnect: (id: string, port: string) => void
  onChange: (id: string, patch: Partial<CanvasNode>) => void
  onHeaderDown: (event: PointerEvent<HTMLElement>, node: CanvasNode) => void
  onHeaderMove: (event: PointerEvent<HTMLElement>) => void
  onHeaderUp: (event: PointerEvent<HTMLElement>) => void
  onPortDown: (event: PointerEvent<HTMLElement>, node: CanvasNode) => void
  onPortMove: (event: PointerEvent<HTMLElement>) => void
  onPortUp: (event: PointerEvent<HTMLElement>) => void
  /** Pressing an input circle either unpicks it or starts a wire from it. */
  onInputDown: (event: PointerEvent<HTMLElement>, node: CanvasNode, port: string) => void
  onMeasure: (id: string, height: number) => void
  /** Reports where a socket sits on the card, so wires land on the right row. */
  onMeasurePort: (id: string, side: "in" | "out", port: string, x: number, y: number) => void
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

export function NodeCard({
  node,
  step,
  selected,
  wired,
  refImages,
  promptText,
  highlightPort,
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

  // Sockets move when the body grows (a wrapped prompt, a longer model name), so
  // measure after every layout rather than once.
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

  const markup = node.markup ?? []
  const refsIn = ports.inputs.filter((port) => port.kind === "image" && wired.has(port.id)).length

  return (
    <article
      ref={cardRef}
      data-node-id={node.id}
      style={{ left: node.x, top: node.y, width: NODE_WIDTH }}
      onPointerDown={(event) => event.stopPropagation()}
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
                drop a screenshot
              </div>
            )}

            {[...markup, ...(draft ? [draft] : [])].map((rect, index) => (
              <span
                key={index}
                aria-hidden
                className="pointer-events-none absolute border-2 border-brand bg-brand/10"
                style={{
                  left: `${rect.x * 100}%`,
                  top: `${rect.y * 100}%`,
                  width: `${rect.w * 100}%`,
                  height: `${rect.h * 100}%`,
                }}
              />
            ))}

            {marking ? (
              <span className="pointer-events-none absolute inset-x-0 top-0 bg-brand/90 px-1.5 py-0.5 font-mono text-[9px] text-background">
                drag a border around the piece
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
                    ? "border-brand bg-brand text-background"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {marking ? "done" : markup.length > 0 ? `marked ${markup.length}` : "mark"}
              </button>
            </span>
          </div>
        </div>
      ) : null}

      {node.kind === "assist" ? (
        <div className="p-2.5">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] text-muted-foreground">Reads the borders</span>
            <span className="font-mono text-[10px] tabular-nums text-foreground">
              {refsIn} / {ASSIST_REFS}
            </span>
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
            Vision pass over the references, then one prompt for the edit step.
          </p>
          <p className="mt-2 font-mono text-[9px] tracking-[0.02em] text-muted-foreground-soft">
            gemini 3.8 flash · reads images
          </p>
        </div>
      ) : null}

      {node.kind === "text" ? (
        <div className="p-2.5">
          <textarea
            value={node.prompt ?? ""}
            onChange={(event) => onChange(node.id, { prompt: event.target.value })}
            rows={5}
            spellCheck={false}
            aria-label="Prompt, review before the run"
            placeholder="The assist step writes the prompt here — edit it before running."
            className="w-full resize-none border-0 bg-transparent p-0 text-[12px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground-soft"
          />
          <p className="mt-2 font-mono text-[10px] tracking-[0.02em] text-muted-foreground-soft">
            {(node.prompt ?? "").length} characters · editable
          </p>
        </div>
      ) : null}

      {node.kind === "prompt" ? (
        <div className="p-2.5">
          <textarea
            value={node.prompt ?? ""}
            onChange={(event) => onChange(node.id, { prompt: event.target.value })}
            rows={4}
            spellCheck={false}
            aria-label="Prompt"
            className="w-full resize-none border-0 bg-transparent p-0 text-[12px] leading-relaxed text-foreground outline-none"
          />
          <p className="mt-2 font-mono text-[10px] tracking-[0.02em] text-muted-foreground-soft">
            {(node.prompt ?? "").length} characters
          </p>
        </div>
      ) : null}

      {node.kind === "edit" ? (
        <div className="p-2.5">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] text-muted-foreground">References</span>
            <span className="font-mono text-[10px] tabular-nums text-foreground">
              {refImages.filter(Boolean).length} / {MAX_REFS}
            </span>
          </div>

          <div className="mt-1.5 grid grid-cols-5 gap-1">
            {Array.from({ length: MAX_REFS }, (_, index) => {
              const image = refImages[index]
              return image ? (
                <div
                  key={`ref-${index}`}
                  className="aspect-square overflow-hidden rounded-sm border border-border bg-muted"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={image} alt="" className="size-full object-cover object-top" />
                </div>
              ) : (
                <div
                  key={`ref-${index}`}
                  className="flex aspect-square items-center justify-center rounded-sm border border-dashed border-border font-mono text-[9px] text-muted-foreground-soft"
                >
                  {index + 1}
                </div>
              )
            })}
          </div>

          <label className="mt-2.5 block text-[11px] text-muted-foreground" htmlFor={`${node.id}-model`}>
            Model
          </label>
          <select
            id={`${node.id}-model`}
            value={node.model ?? MODELS[0]}
            onChange={(event) => onChange(node.id, { model: event.target.value })}
            className="mt-1 w-full rounded-md border border-border bg-background px-1.5 py-1 text-[12px] text-foreground outline-none"
          >
            {MODELS.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>

          <p className="mt-1.5 line-clamp-2 font-mono text-[9px] leading-relaxed text-muted-foreground-soft">
            {promptText ? promptText : "no prompt wired"}
          </p>

          {node.output ? (
            <div className="mt-2 aspect-square w-full overflow-hidden rounded-sm border border-border bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={node.output} alt="" className="size-full object-cover object-top" />
            </div>
          ) : null}
        </div>
      ) : null}

      {node.kind === "refine" ? (
        <div className="p-2.5">
          <div className="flex items-baseline justify-between">
            <label className="text-[11px] text-muted-foreground" htmlFor={`${node.id}-strength`}>
              Strength
            </label>
            <span className="font-mono text-[10px] tabular-nums text-foreground">
              {(node.strength ?? 0.35).toFixed(2)}
            </span>
          </div>
          <input
            id={`${node.id}-strength`}
            type="range"
            min={0.05}
            max={0.9}
            step={0.05}
            value={node.strength ?? 0.35}
            onChange={(event) => onChange(node.id, { strength: Number(event.target.value) })}
            className="mt-2 w-full accent-[var(--brand)]"
          />
          <p className="mt-1 font-mono text-[9px] tracking-[0.02em] text-muted-foreground-soft">
            keeps the face and the light
          </p>
        </div>
      ) : null}

      {node.kind === "upscale" ? (
        <div className="p-2.5">
          <p className="text-[11px] text-muted-foreground">Factor</p>
          <div className="mt-1.5 flex gap-1.5">
            {[2, 4].map((factor) => {
              const active = (node.factor ?? 2) === factor
              return (
                <button
                  key={factor}
                  type="button"
                  onClick={() => onChange(node.id, { factor })}
                  aria-pressed={active}
                  className={`rounded-md border px-2.5 py-1 font-mono text-[11px] ${
                    active
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-background text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {factor}×
                </button>
              )
            })}
          </div>
          <p className="mt-2 font-mono text-[10px] tracking-[0.02em] text-muted-foreground-soft">
            {node.factor === 4 ? "4×000 px wide" : "2880 px wide"}
          </p>
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
                : `${(RUN_MS[node.kind] / 1000).toFixed(1)}s`}
        </span>
      </div>
    </article>
  )
}
