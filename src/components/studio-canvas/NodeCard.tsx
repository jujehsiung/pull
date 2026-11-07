"use client"

/**
 * One node on the studio canvas. Square, hairline, mono numbers — the canvas is
 * NERV-shaped: numbered steps, technical labels, nothing rounded.
 *
 * The header is the drag handle; the right port starts a connection. The body is
 * whatever that step takes: an image, a sentence, a model, a strength, a factor,
 * a filename.
 */
import { useEffect, useRef, type PointerEvent } from "react"

import { Input } from "@/components/ui/input"
import { KIND, MAX_REFS, MODELS, NODE_WIDTH, RUN_MS, type CanvasNode } from "./types"

const DOT: Record<CanvasNode["status"], string> = {
  idle: "bg-border",
  running: "bg-brand motion-safe:animate-pulse",
  done: "bg-success",
}

export interface NodeCardProps {
  node: CanvasNode
  /** 1-based position in the run order. */
  step: number
  selected: boolean
  onChange: (id: string, patch: Partial<CanvasNode>) => void
  onHeaderDown: (event: PointerEvent<HTMLElement>, node: CanvasNode) => void
  onHeaderMove: (event: PointerEvent<HTMLElement>) => void
  onHeaderUp: (event: PointerEvent<HTMLElement>) => void
  onPortDown: (event: PointerEvent<HTMLElement>, node: CanvasNode) => void
  onPortMove: (event: PointerEvent<HTMLElement>) => void
  onPortUp: (event: PointerEvent<HTMLElement>) => void
  onMeasure: (id: string, height: number) => void
  /** Images the "+" tile can draw from. */
  referencePool: string[]
}

export function NodeCard({
  node,
  step,
  selected,
  onChange,
  onHeaderDown,
  onHeaderMove,
  onHeaderUp,
  onPortDown,
  onPortMove,
  onPortUp,
  onMeasure,
  referencePool,
}: NodeCardProps) {
  const meta = KIND[node.kind]
  const cardRef = useRef<HTMLElement | null>(null)

  // The ports sit at the card's mid-line, so the height is measured rather than assumed.
  useEffect(() => {
    const element = cardRef.current
    if (!element) return
    const observer = new ResizeObserver(() => onMeasure(node.id, element.offsetHeight))
    observer.observe(element)
    onMeasure(node.id, element.offsetHeight)
    return () => observer.disconnect()
  }, [node.id, onMeasure])

  return (
    <article
      ref={cardRef}
      data-node-id={node.id}
      style={{ left: node.x, top: node.y, width: NODE_WIDTH }}
      onPointerDown={(event) => event.stopPropagation()}
      className={`pointer-events-auto absolute bg-card transition-colors ${
        node.status === "running" ? "border border-brand" : "border border-border"
      } ${selected ? "outline outline-1 outline-offset-0 outline-foreground/40" : ""}`}
    >
      {node.kind !== "upload" ? (
        <span
          data-input-node={node.id}
          aria-hidden
          className="absolute -left-[5px] top-1/2 size-2.5 -translate-y-1/2 border border-border bg-card"
        />
      ) : null}

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

      {node.kind === "upload" ? (
        <div className="p-2.5">
          {node.image ? (
            <div className="aspect-square w-full overflow-hidden border border-border bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={node.image} alt="" className="size-full object-cover" />
            </div>
          ) : (
            <div className="flex aspect-square w-full items-center justify-center border border-dashed border-border text-[11px] text-muted-foreground-soft">
              drop a screenshot
            </div>
          )}
          <p className="mt-2 truncate font-mono text-[10px] tracking-[0.02em] text-muted-foreground-soft">
            {node.image?.split("/").pop() ?? "—"}
          </p>
        </div>
      ) : null}

      {node.kind === "prompt" ? (
        <div className="p-2.5">
          <textarea
            value={node.prompt ?? ""}
            onChange={(event) => onChange(node.id, { prompt: event.target.value })}
            rows={5}
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
              {(node.refs ?? []).length} / {MAX_REFS}
            </span>
          </div>

          <div className="mt-1.5 grid grid-cols-5 gap-1">
            {(node.refs ?? []).map((src, index) => (
              <div key={`${src}-${index}`} className="group relative aspect-square overflow-hidden border border-border bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="size-full object-cover object-top" />
                <button
                  type="button"
                  aria-label={`Remove reference ${index + 1}`}
                  onClick={() =>
                    onChange(node.id, { refs: (node.refs ?? []).filter((_, position) => position !== index) })
                  }
                  className="absolute right-0 top-0 flex size-4 items-center justify-center bg-foreground/80 font-mono text-[9px] leading-none text-background opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                >
                  ×
                </button>
              </div>
            ))}

            {(node.refs ?? []).length < MAX_REFS ? (
              <button
                type="button"
                aria-label="Add a reference"
                onClick={() => {
                  const current = node.refs ?? []
                  const next = referencePool.find((candidate) => !current.includes(candidate))
                  if (next) onChange(node.id, { refs: [...current, next] })
                }}
                className="flex aspect-square items-center justify-center border border-dashed border-border font-mono text-[12px] leading-none text-muted-foreground-soft hover:border-foreground hover:text-foreground"
              >
                +
              </button>
            ) : null}
          </div>

          <label className="mt-2.5 block text-[11px] text-muted-foreground" htmlFor={`${node.id}-model`}>
            Model
          </label>
          <select
            id={`${node.id}-model`}
            value={node.model ?? MODELS[0]}
            onChange={(event) => onChange(node.id, { model: event.target.value })}
            className="mt-1 w-full border border-border bg-background px-1.5 py-1 text-[12px] text-foreground outline-none"
          >
            {MODELS.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
          <p className="mt-1.5 font-mono text-[10px] tracking-[0.02em] text-muted-foreground-soft">
            the prompt rides in separately
          </p>
        </div>
      ) : null}

      {node.kind === "refine" ? (
        <div className="p-2.5">
          <div className="flex items-baseline justify-between">
            <label className="text-[10px] text-muted-foreground" htmlFor={`${node.id}-strength`}>
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
          <p className="mt-1 font-mono text-[10px] tracking-[0.02em] text-muted-foreground-soft">
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
                  className={`border px-2.5 py-1 font-mono text-[11px] ${
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
              <img src={node.output} alt="" className="size-full object-cover" />
            </div>
          ) : null}
          <p className="mt-2 font-mono text-[10px] tracking-[0.02em] text-muted-foreground-soft">
            {node.output ? "1 image · in the assets" : "goes to the studio assets"}
          </p>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2 border-t border-border px-2.5 py-1">
        <span className="truncate text-[10px] text-muted-foreground-soft">{meta.note}</span>
        <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground-soft">
          {node.status === "done" && node.durationMs
            ? `${(node.durationMs / 1000).toFixed(1)}s`
            : node.status === "running"
              ? "…"
              : (RUN_MS[node.kind] / 1000).toFixed(1) + "s"}
        </span>
      </div>

      {node.kind !== "save" ? (
        <span
          data-output-port={node.id}
          role="button"
          aria-label={`Connect from ${meta.name}`}
          onPointerDown={(event) => onPortDown(event, node)}
          onPointerMove={onPortMove}
          onPointerUp={onPortUp}
          onPointerCancel={onPortUp}
          className="absolute -right-[5px] top-1/2 size-2.5 -translate-y-1/2 cursor-crosshair border border-border bg-card hover:border-foreground hover:bg-brand"
        />
      ) : null}
    </article>
  )
}
