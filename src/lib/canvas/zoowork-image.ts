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

/**
 * The route's maxDuration is 300s; this budget keeps the whole compose inside it. A function
 * killed at the ceiling closes the stream with no result line at all — "the run ended without
 * a result" is the worst failure shape for a demo, so the code finishes before it can happen.
 */
const BUDGET_MS = 280_000

export interface LookRef {
  name: string
  /** `data:image/…;base64,…` — the clean copy, used for the render. */
  dataUrl: string
  /** A small copy for the reading model, with the stylist's border baked in. */
  assistDataUrl?: string
  /** Whether the stylist drew a border on this reference (drives the hard clause). */
  marked?: boolean
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
  sources: (string | undefined)[],
  names: string[],
): Promise<(string | undefined)[]> {
  const paths: (string | undefined)[] = []
  for (const [index, source] of sources.entries()) {
    if (!source) {
      paths.push(undefined)
      continue
    }
    const ext = EXT[mimeOf(source)] ?? "png"
    const path = `refs/${folder}/${index + 1}-${slug(names[index] ?? "ref")}.${ext}`
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

/**
 * The prompt used when the vision pass cannot run. It names no roles — it can only ask the
 * edit model to combine what the references show, which is exactly what the pictures say.
 */
export function templatePrompt(refs: LookRef[]): string {
  const count = Math.max(1, refs.length)
  const bordered = refs.filter((ref) => ref.marked).length
  return (
    `Editorial full-length fashion photograph built from ${count} references: dress the person ` +
    `in the outfit the references show. ` +
    (bordered > 0
      ? `${bordered} reference${bordered === 1 ? "" : "s"} carried a red border; each contributes ` +
        `exactly the piece inside its border, and every one of those pieces must appear in the ` +
        `final look — do not drop one. `
      : "") +
    `Keep the person's face and hair exactly; carry each garment's colour, cut and fabric from ` +
    `its own reference. Plain studio background, soft daylight, whole outfit visible.`
  )
}

/**
 * Compose the look: read the references (or reuse a prompt the stylist edited), render it,
 * publish the result. One function, one round trip from the canvas.
 */
export async function composeLook(
  refs: LookRef[],
  givenPrompt?: string,
  onPhase?: (phase: string) => void,
): Promise<LookResult> {
  const started = Date.now()
  /** What is left of the ceiling, minus room to answer with. */
  const remaining = () => Math.max(5_000, BUDGET_MS - (Date.now() - started))
  const say = (phase: string) => {
    console.log(`canvas ${Math.round((Date.now() - started) / 1000)}s · ${phase}`)
    try {
      onPhase?.(phase)
    } catch {
      // A progress callback must never fail the run.
    }
  }

  say("connecting to the agent")
  const c = client()
  const agentId = await ensureAgent(c)

  say("uploading the references")
  const names = refs.map((ref) => ref.name)
  const cleanPaths = (await uploadRefs(c, agentId, "look", refs.map((ref) => ref.dataUrl), names)).filter(
    (path): path is string => Boolean(path),
  )
  if (cleanPaths.length === 0) throw new Error("no references to compose")
  const assistPaths = await uploadRefs(
    c,
    agentId,
    "look-read",
    refs.map((ref) => ref.assistDataUrl ?? ref.dataUrl),
    names,
  )

  let prompt = givenPrompt?.trim() ?? ""
  let promptSource: LookResult["promptSource"] = "edited"

  if (prompt.length < 20) {
    // A cold agent or a dropped stream is transient, so read twice before falling back.
    let read = ""
    try {
      const list = refs
        .map((ref, index) => {
          const path = assistPaths[index] ?? cleanPaths[index] ?? "(missing)"
          const border = ref.marked ? " — a red border is drawn on it" : ""
          return `${index + 1}. ${ref.name} — ${path}${border}`
        })
        .join("\n")
      const content = [
        "You are dressing one person for a single editorial look. The references are:",
        list,
        "",
        "Nothing on these references names what it is. Read the pictures: one reference is the",
        "person to dress, the others are garments — and each garment is a different part of the",
        "outfit. A red border drawn on a picture marks the exact object to use from it. Work out",
        "each reference's meaning yourself from what you see and from the borders; do not assume",
        "an order.",
        "",
        "Read the images with your image tool, then write ONE prompt for an image-edit model that",
        "dresses that person in those garments. Keep the person's face and hair exactly, and carry",
        "each garment's colour, cut and fabric from its own reference; let the pose and setting",
        "follow the garment photographs. EVERY reference with a red border must contribute the piece",
        "inside that border — the final look must include all of them, and the prompt must say so",
        "explicitly (name each one: outer layer, top, bottom). Be concrete about what each picture",
        "contributes. Reply with the prompt only, at most 70 words — no preamble, no quotes, no",
        "markdown.",
      ].join("\n")

      say("reading the pictures")
      let lastError: unknown = null
      for (let attempt = 0; attempt < 2 && read.length < 20; attempt += 1) {
        // One attempt gets at most 90s, and a retry only happens with room for the render.
        if (attempt > 0 && remaining() < 170_000) break
        const readCap = remaining() > 240_000 ? 120_000 : 90_000
        const readBudget = Math.min(readCap, Math.max(20_000, remaining() - 150_000))
        try {
          const session = await c.createSession(agentId, {
            initial_events: [{ type: "user.message", content }],
            metadata: { app: "pull-canvas", step: "read" },
          })
          const turn = await readTurn(c, agentId, session.session_id, readBudget)
          const written = cleanPrompt(turn.text)
          if (turn.outcome === "succeeded" && written.length >= 20) read = written
          else lastError = new Error(`read turn ${turn.outcome ?? "ended early"} (${written.length} chars)`)
        } catch (error) {
          lastError = error
        }
      }
      if (read.length < 20) console.error("canvas: vision pass failed, using the template prompt —", lastError)
    } catch (error) {
      console.error("canvas: vision pass errored, using the template prompt —", error)
    }

    if (read.length >= 20) {
      prompt = read
      promptSource = "assist"
    } else {
      prompt = templatePrompt(refs)
      promptSource = "template"
    }
  }

  // Never call the render with an empty prompt: the pictures alone are not an instruction.
  if (prompt.trim().length < 20) {
    prompt = templatePrompt(refs)
    promptSource = "template"
  }

  if (remaining() < 45_000) throw new Error("the run ran out of time before the render — try again")
  say("rendering the look · gpt-image-2")
  // One image_generate edit: the clean references, the prompt, a published Artifact.
  const borderNotes = refs
    .map((ref, index) => (ref.marked ? `- reference ${index + 1} carried a red border: the clean image here is the same picture without the line, and the piece inside that border must appear in the result` : null))
    .filter((line): line is string => Boolean(line))
  const content = [
    "Use the image_generate tool now, with these arguments:",
    `- action: "edit"`,
    `- images: ${JSON.stringify(cleanPaths)}`,
    "- images: the references; the prompt says what each one contributes",
    ...borderNotes,
    "- the prompt is the contract: every garment it names must appear, and no bordered piece may be dropped",
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
  const turn = await readTurn(c, agentId, session.session_id, Math.max(20_000, remaining() - 15_000))

  say("saving the render")
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
