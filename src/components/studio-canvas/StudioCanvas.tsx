"use client"

/**
 * The studio canvas — a node graph for making a look.
 *
 * Six kinds of step, wired left to right: upload a screenshot, write the prompt,
 * edit the image, refine it, upscale it, save it. Drag a card to move it, drag the
 * background to pan, drag a port to connect. Run walks the graph in order; when it
 * finishes, the assets panel slides out with what the save step produced.
 *
 * A design surface: the run is modelled (durations, statuses, outputs) rather than
 * wired to a provider. The node vocabulary is the real one from PRODUCT.md Phase 4.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { X } from "lucide-react"
import type { PointerEvent } from "react"

import { Button } from "@/components/ui/button"
import { NodeCard } from "./NodeCard"
import { imageDataUrl, postJson } from "./image-bits"
import {
  INITIAL_EDGES,
  KIND,
  PORTS,
  NODE_WIDTH,
  PALETTE,
  REF_ROLES,
  RUN_MS,
  initialNodes,
  topologicalOrder,
  type CanvasEdge,
  type CanvasNode,
  type NodeKind,
} from "./types"

const EMPTY_SET = new Set<string>()
const DOTS = "radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--border) 70%, transparent) 1px, transparent 0)"

function defaultsFor(kind: NodeKind): Partial<CanvasNode> {
  switch (kind) {
    case "upload":
      return {}
    case "compose":
      return {}
    case "save":
      return { filename: "untitled.png" }
  }
}

export function StudioCanvas({
  refs,
  sampleAssets,
}: {
  refs: { name: string; image: string }[]
  sampleAssets: string[]
}) {
  const [nodes, setNodes] = useState<CanvasNode[]>(() => initialNodes(refs))
  const [edges, setEdges] = useState<CanvasEdge[]>(INITIAL_EDGES)
  const [camera, setCamera] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(0.85)
  const [selected, setSelected] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [completed, setCompleted] = useState(0)
  const [assets, setAssets] = useState<string[]>([])
  const [stubNote, setStubNote] = useState<string | null>(null)
  const [assetsOpen, setAssetsOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [linkFrom, setLinkFrom] = useState<{ x: number; y: number } | null>(null)
  const [snapPort, setSnapPort] = useState<string | null>(null)
  const [hoverEdge, setHoverEdge] = useState<string | null>(null)
  const [linkPoint, setLinkPoint] = useState<{ x: number; y: number } | null>(null)
  const [heights, setHeights] = useState<Record<string, number>>({})
  const [portPoint, setPortPoint] = useState<
    Record<string, { in: Record<string, { x: number; y: number }>; out: Record<string, { x: number; y: number }> }>
  >({})

  const canvasRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef({ camera, zoom })
  viewRef.current = { camera, zoom }
  const panelRef = useRef<HTMLElement | null>(null)
  const [panelWidth, setPanelWidth] = useState(0)
  const [wide, setWide] = useState(true)
  const dragRef = useRef<{ id: string; startX: number; startY: number; x: number; y: number } | null>(null)
  const panRef = useRef<{ startX: number; startY: number; camX: number; camY: number } | null>(null)
  const linkRef = useRef<{ side: "in" | "out"; nodeId: string; port: string } | null>(null)
  const runRef = useRef(false)
  const nodesRef = useRef(nodes)
  nodesRef.current = nodes
  const clipboardRef = useRef<{
    node: Omit<CanvasNode, "id" | "step" | "status" | "durationMs" | "output">
    count: number
  } | null>(null)

  const order = useMemo(() => topologicalOrder(nodes, edges), [nodes, edges])
  const nextStep = () => Math.max(0, ...nodesRef.current.map((node) => node.step)) + 1

  const fit = useCallback(() => {
    const element = canvasRef.current
    if (!element || nodes.length === 0) return
    const rect = element.getBoundingClientRect()
    const minX = Math.min(...nodes.map((node) => node.x)) - 64
    const minY = Math.min(...nodes.map((node) => node.y)) - 64
    const maxX = Math.max(...nodes.map((node) => node.x + (node.width ?? NODE_WIDTH))) + 64
    const maxY = Math.max(...nodes.map((node) => node.y)) + 360
    const raw = Math.min(rect.width / (maxX - minX), rect.height / (maxY - minY), 1)
    // Never shrink the cards into illegibility; on a narrow frame the graph pans instead.
    const next = Math.min(Math.max(raw, 0.45), 1)
    const contentWidth = (maxX - minX) * next
    setZoom(next)
    setCamera({
      x: contentWidth > rect.width ? 24 - minX * next : (rect.width - contentWidth) / 2 - minX * next,
      y: (rect.height - (maxY - minY) * next) / 2 - minY * next,
    })
  }, [nodes])

  // Frame the graph once, after the canvas has been measured.
  const fitRef = useRef(fit)
  fitRef.current = fit
  useEffect(() => {
    const frame = requestAnimationFrame(() => fitRef.current())
    return () => cancelAnimationFrame(frame)
  }, [])

  // A narrow frame cannot give the panel a column, so there it slides over the canvas.
  useEffect(() => {
    const query = window.matchMedia("(min-width: 768px)")
    const sync = () => setWide(query.matches)
    sync()
    query.addEventListener("change", sync)
    return () => query.removeEventListener("change", sync)
  }, [])

  // Measure the panel so the canvas gives it exactly its width, at any viewport.
  useEffect(() => {
    const element = panelRef.current
    if (!element) return
    const observer = new ResizeObserver(() => setPanelWidth(element.offsetWidth))
    observer.observe(element)
    setPanelWidth(element.offsetWidth)
    return () => observer.disconnect()
  }, [])

  // Open on the whole graph: the demo should show every card without hunting for it.
  useEffect(() => {
    const timer = setTimeout(() => fitRef.current(), 140)
    return () => clearTimeout(timer)
  }, [])

  // The assets panel takes width from the canvas; refit so nothing hides behind it.
  useEffect(() => {
    const timer = setTimeout(() => fitRef.current(), 540)
    return () => clearTimeout(timer)
  }, [assetsOpen])

  const copySelected = useCallback(() => {
    const node = nodesRef.current.find((candidate) => candidate.id === selected)
    if (!node) return
    const { kind, x, y, width, image, imageLabel, markup, prompt, filename } = node
    clipboardRef.current = {
      node: { kind, x, y, width, image, imageLabel, markup, prompt, filename },
      count: 0,
    }
  }, [selected])

  const pasteNode = useCallback(() => {
    const clip = clipboardRef.current
    if (!clip) return
    clip.count += 1
    const offset = 28 * clip.count
    const created: CanvasNode = {
      ...clip.node,
      id: `${clip.node.kind}-${Math.random().toString(36).slice(2, 7)}`,
      step: Math.max(0, ...nodesRef.current.map((node) => node.step)) + 1,
      x: clip.node.x + offset,
      y: clip.node.y + offset,
      status: "idle",
    }
    setNodes((current) => [...current, created])
    setSelected(created.id)
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAddOpen(false)
        return
      }

      const target = event.target as HTMLElement | null
      const typing = Boolean(target?.closest("input, textarea, select, [contenteditable='true']"))
      const command = event.metaKey || event.ctrlKey

      if (command && !typing) {
        const key = event.key.toLowerCase()
        if (key === "c") {
          if (!selected) return
          event.preventDefault()
          copySelected()
          return
        }
        if (key === "v") {
          event.preventDefault()
          pasteNode()
          return
        }
        if (key === "d") {
          event.preventDefault()
          copySelected()
          pasteNode()
          return
        }
      }

      if (event.key !== "Backspace" && event.key !== "Delete") return
      if (typing || !selected) return
      event.preventDefault()
      setNodes((current) => current.filter((node) => node.id !== selected))
      setEdges((current) => current.filter((edge) => edge.from !== selected && edge.to !== selected))
      setSelected(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [copySelected, pasteNode, selected])

  const onMeasure = useCallback((id: string, height: number) => {
    setHeights((current) => (current[id] === height ? current : { ...current, [id]: height }))
  }, [])

  const onMeasurePort = useCallback(
    (id: string, side: "in" | "out", port: string, x: number, y: number) => {
      setPortPoint((current) => {
        const node = current[id] ?? { in: {}, out: {} }
        const previous = node[side][port]
        if (previous && previous.x === x && previous.y === y) return current
        return { ...current, [id]: { ...node, [side]: { ...node[side], [port]: { x, y } } } }
      })
    },
    [],
  )

  const midY = (node: CanvasNode) => node.y + (heights[node.id] ?? 120) / 2
  const socketPoint = (node: CanvasNode, side: "in" | "out", port: string) =>
    portPoint[node.id]?.[side]?.[port]
  /** The circle's centre in canvas space — a wire ends on a plug, not on the card's edge. */
  const outputPoint = (node: CanvasNode) => {
    const point = socketPoint(node, "out", PORTS[node.kind].outputs[0]?.id ?? "")
    return point
      ? { x: node.x + point.x, y: node.y + point.y }
      : { x: node.x + NODE_WIDTH, y: node.y + (heights[node.id] ?? 120) / 2 }
  }
  const inputPoint = (node: CanvasNode, port: string) => {
    const point = socketPoint(node, "in", port)
    return point
      ? { x: node.x + point.x, y: node.y + point.y }
      : { x: node.x, y: node.y + (heights[node.id] ?? 120) / 2 }
  }

  /** What each card's sockets are fed with, so the body can show the wiring. */
  const wiring = useMemo(() => {
    const map = new Map<
      string,
      { wired: Set<string>; images: Record<string, string | undefined>; texts: Record<string, string | undefined> }
    >()
    for (const node of nodes) map.set(node.id, { wired: new Set(), images: {}, texts: {} })
    for (const edge of edges) {
      const entry = map.get(edge.to)
      if (!entry) continue
      entry.wired.add(edge.port)
      const source = nodes.find((node) => node.id === edge.from)
      if (!source) continue
      if (source.image) entry.images[edge.port] = source.image
      if (source.prompt) entry.texts[edge.port] = source.prompt
    }
    return map
  }, [nodes, edges])

  const toCanvas = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return { x: (clientX - rect.left - camera.x) / zoom, y: (clientY - rect.top - camera.y) / zoom }
  }

  /* ── moving a card ─────────────────────────────────────────────────────── */

  const onHeaderDown = (event: PointerEvent<HTMLElement>, node: CanvasNode) => {
    event.stopPropagation()
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    dragRef.current = { id: node.id, startX: event.clientX, startY: event.clientY, x: node.x, y: node.y }
    setSelected(node.id)
  }

  const onHeaderMove = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    if (!drag) return
    const dx = (event.clientX - drag.startX) / zoom
    const dy = (event.clientY - drag.startY) / zoom
    setNodes((current) =>
      current.map((node) =>
        node.id === drag.id ? { ...node, x: Math.round(drag.x + dx), y: Math.round(drag.y + dy) } : node,
      ),
    )
  }

  const onHeaderUp = () => {
    dragRef.current = null
  }

  /* ── panning the canvas ────────────────────────────────────────────────── */

  const onCanvasDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return
    setSelected(null)
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    panRef.current = { startX: event.clientX, startY: event.clientY, camX: camera.x, camY: camera.y }
  }

  const onCanvasMove = (event: PointerEvent<HTMLDivElement>) => {
    const pan = panRef.current
    if (pan) {
      setCamera({
        x: pan.camX + (event.clientX - pan.startX),
        y: pan.camY + (event.clientY - pan.startY),
      })
      return
    }
    if (linkRef.current) {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (rect) setLinkPoint({ x: event.clientX - rect.left, y: event.clientY - rect.top })
    }
  }

  const onCanvasUp = () => {
    panRef.current = null
  }

  const applyZoom = useCallback((pointX: number, pointY: number, deltaY: number) => {
    const view = viewRef.current
    const next = Math.min(1.8, Math.max(0.35, view.zoom * Math.exp(-deltaY * 0.0015)))
    const scale = next / view.zoom
    setZoom(next)
    setCamera({
      x: pointX - (pointX - view.camera.x) * scale,
      y: pointY - (pointY - view.camera.y) * scale,
    })
  }, [])

  /** Wheel zooms toward the pointer; a separate listener because React's is passive. */
  useEffect(() => {
    const element = canvasRef.current
    if (!element) return
    const onWheel = (event: globalThis.WheelEvent) => {
      event.preventDefault()
      const rect = element.getBoundingClientRect()
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY
      applyZoom(event.clientX - rect.left, event.clientY - rect.top, delta)
    }
    element.addEventListener("wheel", onWheel, { passive: false })
    return () => element.removeEventListener("wheel", onWheel)
  }, [applyZoom])

  const zoomFromCentre = (direction: 1 | -1) => {
    const element = canvasRef.current
    if (!element) return
    const rect = element.getBoundingClientRect()
    applyZoom(rect.width / 2, rect.height / 2, direction * 120)
  }

  /* ── wiring two cards ──────────────────────────────────────────────────── */

  /** Both ends can start a wire: an output pulls, an input offers. */
  const beginLink = (event: PointerEvent<HTMLElement>, side: "in" | "out", node: CanvasNode, port: string) => {
    event.stopPropagation()
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    const element = event.currentTarget as HTMLElement
    // Anchor on the plug itself; find the circle inside the row if the row was pressed.
    const circle = (element.querySelector("[data-port-id]") ?? element) as HTMLElement
    const rect = circle.getBoundingClientRect()
    const canvasRect = canvasRef.current?.getBoundingClientRect()
    const point = canvasRect
      ? { x: rect.left + rect.width / 2 - canvasRect.left, y: rect.top + rect.height / 2 - canvasRect.top }
      : { x: 0, y: 0 }
    linkRef.current = { side, nodeId: node.id, port }
    setLinkFrom(point)
    setLinkPoint(point)
    setSnapPort(null)
  }

  const onPortDown = (event: PointerEvent<HTMLElement>, node: CanvasNode) => {
    beginLink(event, "out", node, PORTS[node.kind].outputs[0]?.id ?? "image")
  }

  /** Pressing an input: unpick whatever is there, then offer a wire from that plug. */
  const onInputDown = (event: PointerEvent<HTMLElement>, node: CanvasNode, port: string) => {
    onDisconnect(node.id, port)
    beginLink(event, "in", node, port)
  }

  type SocketRef = { nodeId: string; port: string; side: "in" | "out" }

  const portUnder = (clientX: number, clientY: number): SocketRef | null => {
    const target = document.elementFromPoint(clientX, clientY)?.closest("[data-socket]")
    const value = target?.getAttribute("data-socket")
    if (!value) return null
    const [nodeId, port, side] = value.split(":")
    if (!nodeId || !port || (side !== "in" && side !== "out")) return null
    return { nodeId, port, side }
  }

  const onDisconnect = useCallback((id: string, port: string) => {
    setEdges((current) => current.filter((edge) => !(edge.to === id && edge.port === port)))
  }, [])

  const onPortMove = (event: PointerEvent<HTMLElement>) => {
    if (!linkRef.current) return
    const rect = canvasRef.current?.getBoundingClientRect()
    if (rect) setLinkPoint({ x: event.clientX - rect.left, y: event.clientY - rect.top })
    const under = portUnder(event.clientX, event.clientY)
    setSnapPort(under ? `${under.nodeId}:${under.port}` : null)
  }

  const onPortUp = (event: PointerEvent<HTMLElement>) => {
    const link = linkRef.current
    linkRef.current = null
    setLinkFrom(null)
    setLinkPoint(null)
    if (!link) return

    const target = portUnder(event.clientX, event.clientY)
    setSnapPort(null)
    if (!target) return

    // Pulling from an output lands on an input; offering from an input lands on an output.
    const from = link.side === "out" ? link.nodeId : target.nodeId
    const to = link.side === "out" ? target.nodeId : link.nodeId
    const port = link.side === "out" ? target.port : link.port
    if (link.side === target.side || from === to) return

    // An input socket takes one wire: a second one replaces the first.
    setEdges((current) => {
      const without = current.filter((edge) => !(edge.to === to && edge.port === port))
      return [...without, { id: `e-${from}-${to}-${port}-${without.length}`, from, to, port }]
    })
  }

  /* ── adding a card ─────────────────────────────────────────────────────── */

  const addNode = (kind: NodeKind) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    const center = rect
      ? toCanvas(rect.left + rect.width / 2, rect.top + rect.height / 2)
      : { x: 240, y: 120 }
    const id = `${kind}-${Math.random().toString(36).slice(2, 7)}`
    setNodes((current) => [
      ...current,
      {
        id,
        kind,
        step: nextStep(),
        x: Math.round(center.x) - 60,
        y: Math.round(center.y) - 40,
        status: "idle",
        ...defaultsFor(kind),
      },
    ])
    setSelected(id)
    setAddOpen(false)
  }

  /* ── running the graph ─────────────────────────────────────────────────── */

  const run = async () => {
    if (runRef.current) return
    runRef.current = true
    setRunning(true)
    setCompleted(0)
    setAssets([])
    setStubNote(null)
    setNodes((current) =>
      current.map((node) => ({
        ...node,
        status: "idle" as const,
        durationMs: undefined,
        error: undefined,
        output: undefined,
      })),
    )

    const started = new Map<string, number>()
    const renders = new Map<string, string>()
    const produced: string[] = []
    let failed: { reason: string } | null = null

    const patch = (id: string, changes: Partial<CanvasNode>) =>
      setNodes((current) => current.map((item) => (item.id === id ? { ...item, ...changes } : item)))

    /** The references wired into a card, in socket order, with their roles. */
    const refsInto = (id: string) =>
      edges
        .filter((edge) => edge.to === id && edge.port.startsWith("ref "))
        .sort((a, b) => Number(a.port.split(" ")[1]) - Number(b.port.split(" ")[1]))
        .map((edge) => nodes.find((candidate) => candidate.id === edge.from))
        .filter((node): node is CanvasNode => Boolean(node?.image))
        .map((node, index) => ({
          role: REF_ROLES[index] ?? "reference",
          name: node.imageLabel ?? node.id,
          image: node.image as string,
          markup: node.markup ?? [],
        }))

    const imageInto = (id: string): string | undefined => {
      const edge = edges.find((candidate) => candidate.to === id && candidate.port === "image")
      if (!edge) return undefined
      return renders.get(edge.from) ?? nodes.find((node) => node.id === edge.from)?.output
    }

    for (const node of topologicalOrder(nodes, edges)) {
      started.set(node.id, performance.now())
      patch(node.id, { status: "running" })

      try {
        if (node.kind === "compose") {
          const refs = refsInto(node.id)
          if (refs.length === 0) throw new Error("wire the four references first")
          const payload = await Promise.all(
            refs.map(async (ref) => ({
              role: ref.role,
              name: ref.name,
              dataUrl: await imageDataUrl(ref.image),
              ...(ref.markup.length > 0
                ? { markedDataUrl: await imageDataUrl(ref.image, { markup: ref.markup }) }
                : {}),
            })),
          )
          const result = await postJson<{
            ok: boolean
            prompt?: string
            promptSource?: string
            image?: string
            reason?: string
          }>("/api/canvas/look", { refs: payload, prompt: node.prompt || undefined })
          if (!result.ok || !result.image) throw new Error(result.reason ?? "the compose step returned nothing")
          if (result.image) renders.set(node.id, result.image)
          patch(node.id, {
            prompt: result.prompt ?? node.prompt,
            promptSource: (result.promptSource as CanvasNode["promptSource"]) ?? "assist",
            output: result.image,
          })
        } else if (node.kind === "save") {
          const image = imageInto(node.id)
          if (!image) throw new Error("nothing wired into save")
          produced.push(image)
          patch(node.id, { output: image })
        } else {
          await new Promise((resolve) => setTimeout(resolve, RUN_MS[node.kind]))
        }

        patch(node.id, {
          status: "done",
          durationMs: Math.round(performance.now() - (started.get(node.id) ?? 0)),
        })
        setCompleted((current) => current + 1)
      } catch (error) {
        failed = { reason: error instanceof Error ? error.message : "run failed" }
        patch(node.id, {
          status: "failed",
          error: failed.reason,
          durationMs: Math.round(performance.now() - (started.get(node.id) ?? 0)),
        })
        break
      }
    }

    if (failed) {
      // A demo that dead-ends is worse than a labelled fallback: keep the graph, say so.
      setStubNote(`provider unavailable — ${failed.reason}`)
      setAssets(sampleAssets)
    } else {
      setAssets(produced)
    }
    setAssetsOpen(true)
    setRunning(false)
    runRef.current = false
  }

  const pathFor = (from: CanvasNode, to: CanvasNode, port: string) => {
    const start = outputPoint(from)
    const end = inputPoint(to, port)
    const x1 = start.x
    const y1 = start.y
    const x2 = end.x
    const y2 = end.y
    const bend = Math.max(40, Math.abs(x2 - x1) * 0.45)
    return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`
  }

  const done = running || completed > 0

  return (
    <>
      <section className="mx-auto flex max-w-[1440px] flex-wrap items-end justify-between gap-4 px-6 pt-5 md:px-10">
        <div className="min-w-0">
          <p className="text-[10px] tracking-[0.02em] text-muted-foreground">Studio</p>
          <h1 className="mt-1.5 text-[clamp(26px,2.8vw,38px)] font-semibold leading-[0.95] tracking-[-0.035em] text-foreground">
            Look workflow
          </h1>
          <p className="mt-1.5 text-[12px] text-muted-foreground">
            Four references in, one look out — the assistant reads your borders, you review the
            prompt, gpt-image-2 renders it.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 font-mono text-[10px] tracking-[0.02em] text-muted-foreground-soft">
            Agent run · {done ? `${completed}/${nodes.length}` : `0/${nodes.length}`}
          </span>

          <Button size="sm" className="agent-action" onClick={run} disabled={running}>
            {running ? "Running…" : "Run"}
          </Button>
        </div>
      </section>

      <div className="relative mt-3 h-[calc(100dvh-236px)] min-h-[560px] overflow-hidden border-y border-border">
        <div
          ref={canvasRef}
          onPointerDown={onCanvasDown}
          onPointerMove={onCanvasMove}
          onPointerUp={onCanvasUp}
          onPointerCancel={onCanvasUp}
          className="absolute inset-y-0 left-0 cursor-grab touch-none select-none bg-background transition-[right] duration-500 ease-out active:cursor-grabbing"
          style={{
            right: assetsOpen && wide ? panelWidth : 0,
            backgroundImage: DOTS,
            backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
            backgroundPosition: `${camera.x}px ${camera.y}px`,
          }}
        >
          <div
            className="pointer-events-none absolute left-0 top-0 origin-top-left"
            style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${zoom})` }}
          >
            <svg className="absolute left-0 top-0 overflow-visible" width="1" height="1" aria-hidden>
              {edges.map((edge) => {
                const from = nodes.find((node) => node.id === edge.from)
                const to = nodes.find((node) => node.id === edge.to)
                if (!from || !to) return null
                const path = pathFor(from, to, edge.port)
                const active = hoverEdge === edge.id
                return (
                  <g key={edge.id}>
                    <path
                      d={path}
                      fill="none"
                      stroke={active ? "var(--foreground)" : "color-mix(in srgb, var(--foreground) 22%, transparent)"}
                      strokeWidth={active ? 1.5 : 1.25}
                    />
                    {/* a wide invisible stroke, so the wire is easy to hit and click off */}
                    <path
                      d={path}
                      data-wire={edge.id}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={14}
                      pointerEvents="stroke"
                      className="cursor-pointer"
                      onPointerEnter={() => setHoverEdge(edge.id)}
                      onPointerLeave={() => setHoverEdge(null)}
                      onClick={(event) => {
                        event.stopPropagation()
                        setEdges((current) => current.filter((candidate) => candidate.id !== edge.id))
                      }}
                    />
                  </g>
                )
              })}
            </svg>

            {nodes.map((node) => (
              <NodeCard
                key={node.id}
                node={node}
                step={node.step}
                selected={selected === node.id}
                onChange={(id, patch) =>
                  setNodes((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)))
                }
                onHeaderDown={onHeaderDown}
                onHeaderMove={onHeaderMove}
                onHeaderUp={onHeaderUp}
                onPortDown={onPortDown}
                onInputDown={onInputDown}
                onPortMove={onPortMove}
                onPortUp={onPortUp}
                onMeasure={onMeasure}
                onMeasurePort={onMeasurePort}
                onDisconnect={onDisconnect}
                highlightPort={snapPort ?? undefined}
                zoom={zoom}
                wired={wiring.get(node.id)?.wired ?? EMPTY_SET}
              />
            ))}
          </div>
        </div>

        {/* The wire being dragged, in screen space. */}
        {linkFrom && linkPoint ? (
          <svg className="pointer-events-none absolute inset-0 z-10 size-full" aria-hidden>
            <path
              d={`M ${linkFrom.x} ${linkFrom.y} L ${linkPoint.x} ${linkPoint.y}`}
              stroke="var(--foreground)"
              strokeWidth={1.25}
              strokeDasharray="3 3"
              fill="none"
            />
          </svg>
        ) : null}

        {/* The toolbox, centred at the bottom: the things you do to the canvas. */}
        <div
          className={`absolute bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-xl border border-border bg-card p-1 shadow-[0_8px_24px_rgba(10,10,10,0.08)] transition-opacity duration-300 ${
            assetsOpen && !wide ? "pointer-events-none opacity-0" : "opacity-100"
          }`}
        >
          <div className="flex items-center gap-1">
            <div className="relative" data-add-menu>
              <button
                type="button"
                onClick={() => setAddOpen((open) => !open)}
                aria-expanded={addOpen}
                className="rounded-lg px-2.5 py-1.5 text-[11px] text-foreground hover:bg-muted"
              >
                Add node
              </button>
              {addOpen ? (
                <div className="absolute bottom-full left-0 z-30 mb-1 w-[300px] rounded-xl border border-border bg-card p-1 shadow-[0_8px_24px_rgba(10,10,10,0.12)]">
                  {PALETTE.map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => addNode(kind)}
                      className="flex w-full items-baseline gap-3 rounded-md px-2 py-1.5 text-left text-[11px] hover:bg-muted"
                    >
                      <span className="shrink-0 whitespace-nowrap text-foreground">{KIND[kind].name}</span>
                      <span className="ml-auto min-w-0 truncate whitespace-nowrap font-mono text-[9px] text-muted-foreground-soft">
                        {KIND[kind].note}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="flex items-center rounded-lg hover:bg-muted">
              <button
                type="button"
                aria-label="Zoom out"
                onClick={() => zoomFromCentre(-1)}
                className="rounded-l-lg px-2 py-1.5 text-[12px] text-muted-foreground hover:text-foreground"
              >
                −
              </button>
              <span className="px-1 font-mono text-[10px] tabular-nums text-foreground">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                aria-label="Zoom in"
                onClick={() => zoomFromCentre(1)}
                className="rounded-r-lg px-2 py-1.5 text-[12px] text-muted-foreground hover:text-foreground"
              >
                +
              </button>
            </div>

            <button
              type="button"
              onClick={fit}
              className="rounded-lg px-2.5 py-1.5 font-mono text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Fit
            </button>
          </div>
        </div>

        {/* The assets panel, sliding out when the work lands. */}
        <aside
          id="studio-assets"
          ref={panelRef}
          aria-label="Studio assets"
          className={`absolute right-0 top-0 z-20 flex h-full w-[320px] max-w-[88vw] flex-col overflow-hidden rounded-l-xl border-l border-border bg-card shadow-[-12px_0_32px_rgba(10,10,10,0.05)] transition-transform duration-500 ease-out ${
            assetsOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <p className="text-[11px] tracking-[0.02em] text-muted-foreground">Assets · {assets.length}</p>
            <button
              type="button"
              onClick={() => setAssetsOpen(false)}
              aria-label="Close assets"
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {assets.length === 0 ? (
              <p className="px-3 py-6 text-[11px] leading-relaxed text-muted-foreground">
                Nothing yet. Run the graph and the images land here.
              </p>
            ) : (
              <ul className="grid grid-cols-2 gap-px bg-border">
                {assets.map((src, index) => (
                  <li key={`${src}-${index}`} className="bg-card">
                    <div className="aspect-[4/5] overflow-hidden bg-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt="" className="size-full object-cover" />
                    </div>
                    <div className="flex items-baseline justify-between px-1.5 py-1 font-mono text-[9px] text-muted-foreground-soft">
                      <span className="truncate">look-27-v{index + 1}.png</span>
                      <span>2×</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="border-t border-border px-3 py-2 font-mono text-[9px] leading-relaxed text-muted-foreground-soft">
            {stubNote ?? "saved by the graph · gpt-image-2"}
          </p>
        </aside>
      </div>

      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-6 py-2.5 md:px-10">
        <p className="font-mono text-[9px] tracking-[0.02em] text-muted-foreground-soft">
          drag socket to socket to wire · click a wire or a wired socket to unpick · ⌘C / ⌘V copies ·
          scroll zooms · drag the canvas to pan · backspace deletes
        </p>
        <p className="font-mono text-[9px] tracking-[0.02em] text-muted-foreground-soft">
          {nodes.length} nodes · {edges.length} links · {order.length} in the run
        </p>
      </div>

      {/* The assets tab: sticky to the right edge of the viewport, and it rides
          with the panel when the panel is open. */}
      <div
        className="fixed top-1/2 z-40 -translate-y-1/2 transition-[right] duration-500 ease-out"
        style={{ right: assetsOpen ? panelWidth : 0 }}
      >
        <button
          type="button"
          onClick={() => setAssetsOpen((open) => !open)}
          aria-expanded={assetsOpen}
          aria-controls="studio-assets"
          aria-label={assetsOpen ? "Close the studio assets" : "Open the studio assets"}
          className="flex min-h-[92px] flex-col items-center justify-center gap-2 rounded-l-lg rounded-r-none border border-r-0 border-border bg-card px-2 py-4 text-muted-foreground shadow-[-4px_0_16px_rgba(10,10,10,0.04)] hover:bg-muted hover:text-foreground"
        >
          <span
            className="font-mono text-[10px] tabular-nums"
            style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
          >
            {assets.length > 0 ? `Assets · ${assets.length}` : "Assets"}
          </span>
          {assets.length > 0 ? (
            <span aria-hidden className="size-1.5 rounded-full bg-brand" />
          ) : null}
        </button>
      </div>
    </>
  )
}
