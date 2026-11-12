/** The studio canvas: three node kinds, their sockets, and the demo look workflow. */

export type NodeKind = "upload" | "compose" | "save"

export type NodeStatus = "idle" | "running" | "done" | "failed"

export type PortKind = "image" | "text"

export interface PortSpec {
  id: string
  label: string
  kind: PortKind
}

/** A border the stylist drew around an object, normalised 0–1 on the image. */
export interface MarkupRect {
  x: number
  y: number
  w: number
  h: number
}

export interface CanvasNode {
  id: string
  kind: NodeKind
  /** 1-based, assigned when the card is created; it never renumbers. */
  step: number
  x: number
  y: number
  status: NodeStatus
  /** How long this step took, once it has run. */
  durationMs?: number
  /** Card width in canvas units; follows the resize handle. Defaults to NODE_WIDTH. */
  width?: number
  /** upload — the reference image, its role, and the stylist's borders. */
  image?: string
  imageLabel?: string
  markup?: MarkupRect[]
  /** compose — the prompt the assistant wrote (editable), and the render. */
  prompt?: string
  /** compose — how the prompt was produced. */
  promptSource?: "assist" | "template" | "edited"
  /** compose — the live phase while a run is in flight. */
  progress?: string
  /** compose / save */
  output?: string
  /** save */
  filename?: string
  /** why a step failed, shown on the card. */
  error?: string
}

export interface CanvasEdge {
  id: string
  from: string
  /** Node the wire lands on. */
  to: string
  /** Input port id on the target node. */
  port: string
}

export const NODE_WIDTH = 260
/** The resize handle's range: readable at the bottom, useful at the top. */
export const MIN_NODE_WIDTH = 220
export const MAX_NODE_WIDTH = 640
/** Where a port sits when the card has not been measured yet. */
export const PORT_Y = 18

export const KIND: Record<NodeKind, { name: string; note: string }> = {
  upload: { name: "Image", note: "one reference the stylist marks up" },
  compose: { name: "Look compose", note: "reads the refs and their borders" },
  save: { name: "Save image", note: "into the job's assets" },
}

/** The model names the render can use. The first is the Agent's default slot. */
export const MODELS = ["GPT Image 2", "Gemini 3.1 Flash Image"]

/** Which ZooWork alias each card label means. */
export const MODEL_ALIAS: Record<string, string> = {
  "GPT Image 2": "litellm/gpt-image-2",
  "Gemini 3.1 Flash Image": "litellm/gemini-3.1-flash-image",
}

/**
 * The four reference sockets are deliberately unnamed: what a reference means is read
 * from its picture and the stylist's border, not from a label on the socket.
 */
const refPorts: PortSpec[] = Array.from({ length: 4 }, (_, index) => ({
  id: `ref ${index + 1}`,
  label: `ref ${index + 1}`,
  kind: "image" as const,
}))

export const PORTS: Record<NodeKind, { inputs: PortSpec[]; outputs: PortSpec[] }> = {
  upload: { inputs: [], outputs: [{ id: "image", label: "image", kind: "image" }] },
  compose: {
    inputs: refPorts,
    outputs: [{ id: "image", label: "image", kind: "image" }],
  },
  save: { inputs: [{ id: "image", label: "image", kind: "image" }], outputs: [] },
}

export const PALETTE: NodeKind[] = ["upload", "compose", "save"]

/** Fallback timings, used when the real call cannot run (no key, offline). */
export const RUN_MS: Record<NodeKind, number> = {
  upload: 260,
  compose: 60000,
  save: 320,
}

export function initialNodes(refs: { name: string; image: string }[]): CanvasNode[] {
  const spots = [
    { x: 32, y: 24 },
    { x: 320, y: 24 },
    { x: 32, y: 388 },
    { x: 320, y: 388 },
  ]
  const referenceNodes: CanvasNode[] = refs.slice(0, 4).map((ref, index) => ({
    id: `ref-${index + 1}`,
    kind: "upload",
    step: index + 1,
    x: spots[index].x,
    y: spots[index].y,
    status: "idle",
    image: ref.image,
    imageLabel: ref.name,
  }))
  return [
    ...referenceNodes,
    { id: "compose", kind: "compose", step: 5, x: 640, y: 196, status: "idle" },
    { id: "save", kind: "save", step: 6, x: 960, y: 196, status: "idle", filename: "look-27-v1.png" },
  ]
}

/** Only the references that exist are wired: two approved looks read as 2 / 4, not 4 / 4. */
export function initialEdges(referenceCount: number): CanvasEdge[] {
  const refs: CanvasEdge[] = Array.from({ length: Math.min(referenceCount, 4) }, (_, index) => ({
    id: `e-ref${index + 1}`,
    from: `ref-${index + 1}`,
    to: "compose",
    port: `ref ${index + 1}`,
  }))
  return [...refs, { id: "e-compose-save", from: "compose", to: "save", port: "image" }]
}

/** Run order: sources first, ties broken left to right. */
export function topologicalOrder(nodes: CanvasNode[], edges: CanvasEdge[]): CanvasNode[] {
  const incoming = new Map<string, number>(nodes.map((node) => [node.id, 0]))
  for (const edge of edges) incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1)

  const byX = [...nodes].sort((a, b) => a.x - b.x)
  const ready = byX.filter((node) => (incoming.get(node.id) ?? 0) === 0)
  const ordered: CanvasNode[] = []

  while (ready.length > 0) {
    const node = ready.shift()!
    ordered.push(node)
    for (const edge of edges.filter((candidate) => candidate.from === node.id)) {
      const next = (incoming.get(edge.to) ?? 0) - 1
      incoming.set(edge.to, next)
      if (next === 0) {
        const target = byX.find((candidate) => candidate.id === edge.to)
        if (target) ready.push(target)
      }
    }
  }

  // A cycle would strand nodes; append them so a run still walks every card once.
  for (const node of byX) if (!ordered.includes(node)) ordered.push(node)
  return ordered
}
