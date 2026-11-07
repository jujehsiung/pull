/** The studio canvas: six node kinds, their copy, and the example graph. */

export type NodeKind = "upload" | "prompt" | "edit" | "refine" | "upscale" | "save"

export type NodeStatus = "idle" | "running" | "done"

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
  /** upload */
  image?: string
  /** prompt */
  prompt?: string
  /** edit */
  model?: string
  /** edit — up to MAX_REFS reference images */
  refs?: string[]
  /** refine */
  strength?: number
  /** upscale */
  factor?: number
  /** save */
  filename?: string
  /** save — what it wrote into the assets */
  output?: string
}

export interface CanvasEdge {
  id: string
  from: string
  to: string
}

export const NODE_WIDTH = 260
/** Where the ports sit, measured from the node's top edge. */
export const PORT_Y = 18

export const KIND: Record<NodeKind, { name: string; note: string }> = {
  upload: { name: "Upload image", note: "a screenshot from the floor" },
  prompt: { name: "Prompt", note: "what the look should be" },
  edit: { name: "Image edit", note: "the jacket, the other trousers" },
  refine: { name: "Image refine", note: "harmonise light and grain" },
  upscale: { name: "Image upscale", note: "enough to show" },
  save: { name: "Save image", note: "into the job's assets" },
}

export const PALETTE: NodeKind[] = ["upload", "prompt", "edit", "refine", "upscale", "save"]

/** Modelled on the real calls, not real timings. */
export const RUN_MS: Record<NodeKind, number> = {
  upload: 420,
  prompt: 380,
  edit: 1600,
  refine: 1150,
  upscale: 900,
  save: 320,
}

export const MODELS = ["Qwen Edit 2.1", "GPT Image"]
/** What the edit models take, per the provider docs. */
export const MAX_REFS = 10

export function initialNodes(uploadImage: string, references: string[] = []): CanvasNode[] {
  return [
    {
      id: "upload",
      kind: "upload",
      step: 1,
      x: 40,
      y: 24,
      status: "idle",
      image: uploadImage,
    },
    {
      id: "prompt",
      kind: "prompt",
      step: 2,
      x: 40,
      y: 392,
      status: "idle",
      prompt:
        "Put the Louis Vuitton jacket on the model from look 27, with the Prada trousers. Studio light, plain background, same pose.",
    },
    {
      id: "edit",
      kind: "edit",
      step: 3,
      x: 400,
      y: 120,
      status: "idle",
      model: MODELS[0],
      refs: [uploadImage, ...references].filter(Boolean).slice(0, 3),
    },
    { id: "refine", kind: "refine", step: 4, x: 720, y: 120, status: "idle", strength: 0.35 },
    { id: "upscale", kind: "upscale", step: 5, x: 1040, y: 120, status: "idle", factor: 2 },
    { id: "save", kind: "save", step: 6, x: 1360, y: 120, status: "idle", filename: "look-27-v1.png" },
  ]
}

export const INITIAL_EDGES: CanvasEdge[] = [
  { id: "e-prompt-edit", from: "prompt", to: "edit" },
  { id: "e-upload-edit", from: "upload", to: "edit" },
  { id: "e-edit-refine", from: "edit", to: "refine" },
  { id: "e-refine-upscale", from: "refine", to: "upscale" },
  { id: "e-upscale-save", from: "upscale", to: "save" },
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
