/** The studio canvas: node kinds, their sockets, and the demo look workflow. */

export type NodeKind = "upload" | "assist" | "text" | "prompt" | "edit" | "refine" | "upscale" | "save"

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
  /** upload — the reference image, and the stylist's borders on it. */
  image?: string
  imageLabel?: string
  markup?: MarkupRect[]
  /** prompt / text — the prompt, written by hand or by the assist step. */
  prompt?: string
  /** edit */
  model?: string
  /** refine */
  strength?: number
  /** upscale */
  factor?: number
  /** save */
  filename?: string
  /** what this step wrote: the rendered image on edit/save. */
  output?: string
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
/** Where a port sits when the card has not been measured yet. */
export const PORT_Y = 18

export const KIND: Record<NodeKind, { name: string; note: string }> = {
  upload: { name: "Image", note: "a reference the stylist marks up" },
  assist: { name: "Agent assist", note: "reads the marks, writes the prompt" },
  text: { name: "Prompt view", note: "review and edit before the run" },
  prompt: { name: "Prompt", note: "what the look should be" },
  edit: { name: "Image edit", note: "the jacket, the other trousers" },
  refine: { name: "Image refine", note: "harmonise light and grain" },
  upscale: { name: "Image upscale", note: "enough to show" },
  save: { name: "Save image", note: "into the job's assets" },
}

/** The edit step takes five images and one prompt — the model's documented inputs. */
export const MAX_REFS = 5
/** The assist step reads the four references of this workflow. */
export const ASSIST_REFS = 4

const refPorts = (count: number): PortSpec[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `ref ${index + 1}`,
    label: `ref ${index + 1}`,
    kind: "image" as const,
  }))

export const PORTS: Record<NodeKind, { inputs: PortSpec[]; outputs: PortSpec[] }> = {
  upload: { inputs: [], outputs: [{ id: "image", label: "image", kind: "image" }] },
  assist: {
    inputs: refPorts(ASSIST_REFS),
    outputs: [{ id: "prompt", label: "prompt", kind: "text" }],
  },
  text: {
    inputs: [{ id: "prompt", label: "prompt", kind: "text" }],
    outputs: [{ id: "prompt", label: "prompt", kind: "text" }],
  },
  prompt: { inputs: [], outputs: [{ id: "text", label: "text", kind: "text" }] },
  edit: {
    inputs: [{ id: "prompt", label: "prompt", kind: "text" }, ...refPorts(MAX_REFS)],
    outputs: [{ id: "image", label: "image", kind: "image" }],
  },
  refine: {
    inputs: [{ id: "image", label: "image", kind: "image" }],
    outputs: [{ id: "image", label: "image", kind: "image" }],
  },
  upscale: {
    inputs: [{ id: "image", label: "image", kind: "image" }],
    outputs: [{ id: "image", label: "image", kind: "image" }],
  },
  save: { inputs: [{ id: "image", label: "image", kind: "image" }], outputs: [] },
}

export const PALETTE: NodeKind[] = ["upload", "assist", "text", "edit", "save"]

/** The ZooWork image aliases, as the model card names them. */
export const MODELS = ["GPT Image 2", "Gemini 3.1 Flash Image"]

/** Which ZooWork alias each card label means. */
export const MODEL_ALIAS: Record<string, string> = {
  "GPT Image 2": "litellm/gpt-image-2",
  "Gemini 3.1 Flash Image": "litellm/gemini-3.1-flash-image",
}

/** Fallback timings, used when the real call cannot run (no key, offline). */
export const RUN_MS: Record<NodeKind, number> = {
  upload: 260,
  assist: 4200,
  text: 260,
  prompt: 380,
  edit: 9000,
  refine: 1150,
  upscale: 900,
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
    id: index === 0 ? "ref-client" : `ref-${index}`,
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
    { id: "assist", kind: "assist", step: 5, x: 640, y: 196, status: "idle" },
    { id: "text", kind: "text", step: 6, x: 940, y: 196, status: "idle", prompt: "" },
    { id: "edit", kind: "edit", step: 7, x: 1240, y: 168, status: "idle", model: MODELS[0] },
    { id: "save", kind: "save", step: 8, x: 1540, y: 168, status: "idle", filename: "look-27-v1.png" },
  ]
}

export const INITIAL_EDGES: CanvasEdge[] = [
  { id: "e-ref1-assist", from: "ref-client", to: "assist", port: "ref 1" },
  { id: "e-ref2-assist", from: "ref-1", to: "assist", port: "ref 2" },
  { id: "e-ref3-assist", from: "ref-2", to: "assist", port: "ref 3" },
  { id: "e-ref4-assist", from: "ref-3", to: "assist", port: "ref 4" },
  { id: "e-assist-text", from: "assist", to: "text", port: "prompt" },
  { id: "e-text-edit", from: "text", to: "edit", port: "prompt" },
  { id: "e-ref1-edit", from: "ref-client", to: "edit", port: "ref 1" },
  { id: "e-ref2-edit", from: "ref-1", to: "edit", port: "ref 2" },
  { id: "e-ref3-edit", from: "ref-2", to: "edit", port: "ref 3" },
  { id: "e-ref4-edit", from: "ref-3", to: "edit", port: "ref 4" },
  { id: "e-edit-save", from: "edit", to: "save", port: "image" },
]

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
