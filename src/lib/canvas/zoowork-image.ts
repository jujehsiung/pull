/**
 * The look compose, on ZooWork Managed Agents — server only.
 *
 * One agent, one pass over the four references, one render:
 *   1. **read** — a vision pass over the references (with the stylist's borders baked into
 *      the copies it reads) writes the image-edit prompt.
 *   2. **render** — one `image_generate` edit with the clean references and that prompt, on
 *      the Agent's `imageGenerationModel` slot (`gpt-image-2`), published as an Artifact and
 *      returned as a data URL.
 *
 * The prompt comes back with the image so the card can show it and a re-run can reuse it;
 * when the vision pass fails, a deterministic prompt built from the four roles keeps the
 * render alive rather than failing the demo.
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

const LABELS = { app: "pull-canvas", role: "look-editor" }
const AGENT_NAME = "pull-canvas-agent"
/** Reading model: vision-capable and the cheapest row that is. */
const ASSIST_MODEL = "litellm/gemini-3.8-flash"

/** The four references this workflow reads, in socket order. */
export const LOOK_ROLES = ["subject", "the jacket", "the top under the jacket", "the bottom"] as const

export interface LookRef {
  role?: string
  name: string
  /** `data:image/…;base64,…` — the clean copy, used for the render. */
  dataUrl: string
  /** The same image with the stylist's borders drawn on, read by the vision pass. */
  markedDataUrl?: string
}

export interface LookResult {
  prompt: string
  promptSource: "assist" | "template" | "edited"
  image: string
  ms: number
  artifactId: string | null
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
  if (comma < 0) throw new Error("a reference is not a data URL")
  return Buffer.from(dataUrl.slice(comma + 1), "base64")
}

function mimeOf(dataUrl: string): string {
  const match = /^data:([^;]+);/.exec(dataUrl)
  return match?.[1] ?? "image/png"
}

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "ref"
}

/** Put one copy of each reference into the agent's workspace. */
async function uploadRefs(
  c: ZooworkClient,
  agentId: string,
  folder: string,
  refs: LookRef[],
  markedOnly: boolean,
): Promise<(string | undefined)[]> {
  const paths: (string | undefined)[] = []
  for (const [index, ref] of refs.entries()) {
    const source = markedOnly ? ref.markedDataUrl : ref.dataUrl
    if (!source) {
      paths.push(undefined)
      continue
    }
    const ext = EXT[mimeOf(source)] ?? "png"
    const path = `refs/${folder}/${index + 1}-${slug(ref.name)}.${ext}`
    const uploaded = await c.uploadFile(agentId, path, toBuffer(source))
    paths.push(uploaded.path ?? `/workspace/${path}`)
  }
  return paths
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

/** The prompt used when the vision pass cannot run: built from the four roles. */
export function templatePrompt(refs: LookRef[]): string {
  const role = (index: number) => refs[index]?.role ?? LOOK_ROLES[index] ?? `reference ${index + 1}`
  return (
    `Editorial full-length fashion photograph. Dress the ${role(0)} from reference 1 in the ` +
    `${role(1)} from reference 2, worn over the ${role(2)} from reference 3, with the ` +
    `${role(3)} from reference 4. Keep the face and hair of reference 1 exactly; carry each ` +
    `garment's colour, cut and fabric exactly from its own reference. Plain studio background, ` +
    `soft daylight, whole outfit visible.`
  )
}

/**
 * Compose the look: read the references (or reuse a prompt the stylist edited), render it,
 * publish the result. One function, one round trip from the canvas.
 */
export async function composeLook(refs: LookRef[], givenPrompt?: string): Promise<LookResult> {
  const started = Date.now()
  const c = client()
  const agentId = await ensureAgent(c)

  const cleanPaths = (await uploadRefs(c, agentId, "look", refs, false)).filter(
    (path): path is string => Boolean(path),
  )
  if (cleanPaths.length === 0) throw new Error("no references to compose")

  let prompt = givenPrompt?.trim() ?? ""
  let promptSource: LookResult["promptSource"] = "edited"

  if (prompt.length < 20) {
    promptSource = "assist"
    try {
      const marked = refs.map((ref) => Boolean(ref.markedDataUrl))
      const assistPaths = marked.some(Boolean)
        ? await uploadRefs(c, agentId, "look-marked", refs, true)
        : cleanPaths
      const list = refs
        .map((ref, index) => {
          const path = assistPaths[index] ?? cleanPaths[index] ?? "(missing)"
          const border = ref.markedDataUrl ? " — the stylist drew a border here" : ""
          return `${index + 1}. ${LOOK_ROLES[index]} (${ref.name}) — ${path}${border}`
        })
        .join("\n")
      const content = [
        "You are dressing a client for one editorial look. The numbered references are:",
        list,
        "",
        "Reference 1 is the client's face — the render must keep that likeness exactly.",
        "Reference 2 is the jacket (the top layer), reference 3 is the top worn under it, and",
        "reference 4 is the bottom (trousers or skirt). A border drawn on an image marks the",
        "exact piece to use from it. Read the images with your image tool, then write ONE prompt",
        "for an image-edit model that dresses the client in refs 2–4. Keep the face and hair of",
        "ref 1, and let the pose and setting follow the garment photographs. Be concrete about",
        "garment, colour and fabric. Reply with the prompt only, at most 70 words — no preamble,",
        "no quotes, no markdown.",
      ].join("\n")
      const session = await c.createSession(agentId, {
        initial_events: [{ type: "user.message", content }],
        metadata: { app: "pull-canvas", step: "read" },
      })
      const turn = await readTurn(c, agentId, session.session_id, 150_000)
      const written = cleanPrompt(turn.text)
      if (turn.outcome === "succeeded" && written.length >= 20) {
        prompt = written
      } else {
        prompt = templatePrompt(refs)
        promptSource = "template"
      }
    } catch {
      // The demo must render even when the reading model is unreachable.
      prompt = templatePrompt(refs)
      promptSource = "template"
    }
  }

  // One image_generate edit: the clean references, the prompt, a published Artifact.
  const content = [
    "Use the image_generate tool now, with these arguments:",
    `- action: "edit"`,
    `- images: ${JSON.stringify(cleanPaths)}`,
    "- image: the first entry of images is the subject; the rest are the garments to carry over",
    `- prompt: ${JSON.stringify(prompt)}`,
    `- size: "1024x1024"`,
    `- save: "/workspace/out/look.png"`,
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
    prompt,
    promptSource,
    image: `data:${mime};base64,${buffer.toString("base64")}`,
    ms: Date.now() - started,
    artifactId: ready.artifact_id,
  }
}
