/**
 * The studio canvas's model calls, on ZooWork Managed Agents — server only.
 *
 * Two passes, one agent:
 *   1. **assist** — a vision pass over the references with the stylist's borders baked in,
 *      which writes the image-edit prompt. Cheap reading model (`gemini-3.8-flash`).
 *   2. **render** — one `image_generate` call with the clean references as `images` and that
 *      prompt, on the Agent's `imageGenerationModel` slot (`gpt-image-2`), published as an
 *      Artifact and handed back as a data URL.
 *
 * The API key never reaches the browser: the canvas posts data URLs, the route returns the
 * prompt or the render.
 */
import {
  assistantText,
  createZooworkClient,
  isRunFinished,
  runOutcome,
  ZooworkError,
  type ZooworkClient,
} from "@zoowork-ai/sdk"

import { env } from "@/lib/env"

const DEFAULT_BASE = "https://clawapi.ecap.gsmo.ai/service/v1"
const LABELS = { app: "pull-canvas", role: "look-editor" }
const AGENT_NAME = "pull-canvas-agent"
/** Reading model: vision-capable and the cheapest row that is. */
const ASSIST_MODEL = "litellm/gemini-3.8-flash"
/** The Agent's image-generation default, named explicitly so billing is predictable. */
const IMAGE_MODEL = "litellm/gpt-image-2"

export interface CanvasRef {
  /** Human name ("the client", "outfit 1") — used in the prompt text. */
  name: string
  /** `data:image/…;base64,…` */
  dataUrl: string
}

export function canvasConfigured(): boolean {
  const e = env()
  return Boolean(e.ZOOWORK_API_KEY && e.ZOOWORK_ENABLED === "true")
}

let cachedClient: ZooworkClient | null = null
let cachedAgentId: string | null = null

function client(): ZooworkClient {
  const e = env()
  if (!e.ZOOWORK_API_KEY) throw new Error("ZOOWORK_API_KEY is not set")
  if (!cachedClient) {
    cachedClient = createZooworkClient({
      apiKey: e.ZOOWORK_API_KEY,
      ...(e.ZOOWORK_BASE_URL ? { baseUrl: e.ZOOWORK_BASE_URL } : {}),
    })
  }
  return cachedClient
}

/** One agent for the canvas, reused across runs (discovered by label on a cold start). */
async function ensureAgent(c: ZooworkClient): Promise<string> {
  if (cachedAgentId) return cachedAgentId
  for await (const agent of c.listAgents({ labels: LABELS })) {
    if (agent.agent_id) {
      cachedAgentId = agent.agent_id
      break
    }
  }
  if (!cachedAgentId) {
    const created = await c.createAgent(
      {
        resource: {
          name: AGENT_NAME,
          labels: LABELS,
          model: { primary: env().ZOOWORK_MODEL ?? ASSIST_MODEL },
          persona: {
            docs: [
              {
                name: "AGENTS.md",
                content:
                  "You are a fashion stylist's assistant. You read reference photographs, respect the " +
                  "borders the stylist drew, and write short, concrete image-edit prompts.",
              },
            ],
          },
          tool_policy: {},
        },
      },
      "pull-canvas-agent-v1",
    )
    cachedAgentId = created.agent_id
  }
  try {
    await c.startAgent(cachedAgentId)
  } catch (error) {
    if (!(error instanceof ZooworkError) || error.status !== 409) throw error
  }
  await c.waitUntilRunning(cachedAgentId, { timeoutMs: 45_000, intervalMs: 500 })
  return cachedAgentId
}

function toBuffer(dataUrl: string): Buffer {
  const comma = dataUrl.indexOf(",")
  if (comma < 0) throw new Error("reference is not a data URL")
  return Buffer.from(dataUrl.slice(comma + 1), "base64")
}

function mimeOf(dataUrl: string): string {
  const match = /^data:([^;]+);/.exec(dataUrl)
  return match?.[1] ?? "image/png"
}

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }

/** Put the references into the agent's workspace and return their paths. */
async function uploadRefs(c: ZooworkClient, agentId: string, folder: string, refs: CanvasRef[]): Promise<string[]> {
  const paths: string[] = []
  for (const [index, ref] of refs.entries()) {
    const ext = EXT[mimeOf(ref.dataUrl)] ?? "png"
    const path = `refs/${folder}/${index + 1}-${slug(ref.name)}.${ext}`
    const uploaded = await c.uploadFile(agentId, path, toBuffer(ref.dataUrl))
    paths.push(uploaded.path ?? `/workspace/${path}`)
  }
  return paths
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "ref"
}

/** Read one turn to its end, collecting the assistant's text. */
async function readTurn(
  c: ZooworkClient,
  agentId: string,
  sessionId: string,
  timeoutMs: number,
): Promise<{ text: string; outcome: string | undefined }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let text = ""
  let outcome: string | undefined
  try {
    for await (const event of c.streamEvents(agentId, sessionId, { signal: controller.signal })) {
      text += assistantText(event)
      if (isRunFinished(event)) {
        outcome = runOutcome(event)
        break
      }
    }
  } finally {
    clearTimeout(timer)
    controller.abort()
  }
  return { text: text.trim(), outcome }
}

/** Strip the wrappers models like to add around a prompt. */
function cleanPrompt(raw: string): string {
  return raw
    .replace(/^```[a-z]*\n?/i, "")
    .replace(/\n?```$/, "")
    .replace(/^\s*(prompt|image prompt)\s*:\s*/i, "")
    .replace(/^["'“”](.*)["'“”]$/s, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 900)
}

/**
 * Pass 1 — the assistant reads the marked references and writes the prompt.
 * `refs` carry the borders drawn on; they are supplied by the client already baked in.
 */
export async function assistPrompt(refs: CanvasRef[], note?: string): Promise<{ prompt: string; ms: number }> {
  const started = Date.now()
  const c = client()
  const agentId = await ensureAgent(c)
  const paths = await uploadRefs(c, agentId, "assist", refs)

  const list = paths.map((path, index) => `${index + 1}. ${refs[index]?.name ?? "reference"} — ${path}`).join("\n")
  const content = [
    "You are helping a stylist build one look. The reference images are in the workspace:",
    list,
    "",
    "Reference 1 is the client's face — the render must keep that likeness exactly. The other",
    "references are garments. Every border drawn on an image marks the exact object to use from it.",
    "Read the images with your image tool, then write ONE prompt for an image-edit model that dresses",
    "the client in the bordered pieces, keeping the client's face and hair and letting the pose and",
    "framing follow the garment photographs. Be concrete about garment, colour and fabric. No",
    "preamble, no quotes, no markdown:",
    "reply with the prompt only, at most 70 words.",
    note ? `\nStylist's note: ${note}` : "",
  ].join("\n")

  const session = await c.createSession(agentId, {
    initial_events: [{ type: "user.message", content }],
    metadata: { app: "pull-canvas", step: "assist" },
  })
  const turn = await readTurn(c, agentId, session.session_id, 180_000)
  if (turn.outcome !== "succeeded") {
    throw new Error(`assist run did not succeed: ${turn.outcome ?? "stream closed"}`)
  }
  const prompt = cleanPrompt(turn.text)
  if (prompt.length < 20) throw new Error(`assist returned no usable prompt (${prompt.length} chars)`)
  return { prompt, ms: Date.now() - started }
}

/**
 * Pass 2 — one `image_generate` edit with the clean references, published as an Artifact
 * and returned as a data URL so the canvas can show it without a bucket.
 */
export async function renderLook(
  prompt: string,
  refs: CanvasRef[],
  modelAlias = IMAGE_MODEL,
): Promise<{ image: string; ms: number; artifactId: string | null }> {
  const started = Date.now()
  const c = client()
  const agentId = await ensureAgent(c)
  const paths = await uploadRefs(c, agentId, "render", refs)

  // Only name the model when the stylist chose the non-default one: the Agent's
  // `imageGenerationModel` slot already is gpt-image-2, and naming it asks the tool
  // to override a slot it owns.
  const modelLine = modelAlias && modelAlias !== IMAGE_MODEL ? [`- model: "${modelAlias}"`] : []
  const content = [
    "Use the image_generate tool now, with these arguments:",
    `- action: "edit"`,
    ...modelLine,
    `- images: ${JSON.stringify(paths)}`,
    "- image: the first entry of images is the client; the rest are the garments to carry over",
    `- prompt: ${JSON.stringify(prompt)}`,
    "- size: \"1024x1024\"",
    "- save: \"/workspace/out/look.png\"",
    "",
    "Then publish /workspace/out/look.png with artifact_publish and report its artifact id.",
    "Do not substitute the prompt, and do not draw anything with exec.",
  ].join("\n")

  const session = await c.createSession(agentId, {
    initial_events: [{ type: "user.message", content }],
    metadata: { app: "pull-canvas", step: "render" },
  })
  const turn = await readTurn(c, agentId, session.session_id, 300_000)

  const page = await c.listArtifacts(agentId, { sessionId: session.session_id, page: 1, limit: 20 })
  const ready = (page.artifacts ?? []).find((artifact) => artifact.status === "ready")
  if (!ready) {
    throw new Error(
      `render finished (${turn.outcome ?? "no outcome"}) but published no artifact: ${turn.text.slice(0, 200)}`,
    )
  }
  const download = await c.downloadArtifact(agentId, ready.artifact_id)
  if (!download.url) throw new Error("artifact has no download URL yet")
  const response = await fetch(download.url)
  if (!response.ok) throw new Error(`artifact download failed: HTTP ${response.status}`)
  const buffer = Buffer.from(await response.arrayBuffer())
  const mime = response.headers.get("content-type") ?? "image/png"
  return {
    image: `data:${mime};base64,${buffer.toString("base64")}`,
    ms: Date.now() - started,
    artifactId: ready.artifact_id,
  }
}

/** Balance, for the canvas footer. Read-only; safe to call before a run. */
export async function canvasBalance(): Promise<string | null> {
  const e = env()
  if (!e.ZOOWORK_API_KEY) return null
  const base = (e.ZOOWORK_BASE_URL ?? DEFAULT_BASE).replace(/\/+$/, "")
  try {
    const res = await fetch(`${base}/balance`, { headers: { authorization: `Bearer ${e.ZOOWORK_API_KEY}` } })
    if (!res.ok) return null
    const body = (await res.json()) as { available_amount?: string }
    return body.available_amount ?? null
  } catch {
    return null
  }
}
