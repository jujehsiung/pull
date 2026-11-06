/**
 * ZooWork Managed Agents provider (TypeScript SDK, @zoowork-ai/sdk 0.14.0).
 *
 * Behaviour follows https://zoowork.ai/docs (quickstart, build/agents, build/sessions,
 * build/events, reference/errors, reference/models) and the installed SDK's dist/AGENTS.md.
 *
 * Billing guard: this module refuses to create or start an Agent unless ZOOWORK_ENABLED=true.
 * Agent tasks draw on the organization's prepaid balance, so nothing here runs by accident.
 * The key is server-side only.
 */
import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import {
  assistantText,
  createZooworkClient,
  isRunFinished,
  runOutcome,
  ZooworkError,
  type AgentRecord,
  type SessionEvent,
  type ZooworkClient,
} from "@zoowork-ai/sdk"
import { env } from "../../env"
import {
  AgentNotConfiguredError,
  type AgentProvider,
  type AgentTaskInput,
  type AgentTaskResult,
} from "./types"

const AGENT_FILE = join(process.cwd(), "data", "zoowork-agent.json")
const AGENT_LABELS = { app: "pull-demo", role: "request-writer" }
const AGENT_NAME = "pull-request-writer"
const DEFAULT_BASE = "https://clawapi.ecap.gsmo.ai/service/v1"

/** Persona document (canonical name MDs only reach the model). */
const PERSONA = `# AGENTS.md

You write concise, professional pull-request emails for a fashion stylist.

Rules:
- British-neutral, plain language, no marketing adjectives, no exclamation marks.
- Never invent a look that is not in the input.
- Always include the SHOOT DETAILS block: shoot date, call-in date, return date, ship-to.
- If a shipping mode is needs_label, say a prepaid label and pickup will follow.
- Return only what the user asks for. When JSON is requested, return valid JSON with no prose.
`

export function zooworkConfigured(): boolean {
  return Boolean(env().ZOOWORK_API_KEY)
}

/** Billing guard. Only a human sets this, after approving the plan. */
export function zooworkEnabled(): boolean {
  return env().ZOOWORK_ENABLED === "true"
}

export function zooworkReady(): boolean {
  return zooworkConfigured() && zooworkEnabled()
}

let cachedClient: ZooworkClient | null = null

function client(): ZooworkClient {
  const e = env()
  if (!e.ZOOWORK_API_KEY) throw new AgentNotConfiguredError("zoowork", "ZOOWORK_API_KEY")
  if (!cachedClient) {
    cachedClient = createZooworkClient({
      apiKey: e.ZOOWORK_API_KEY,
      ...(e.ZOOWORK_BASE_URL ? { baseUrl: e.ZOOWORK_BASE_URL } : {}),
    })
  }
  return cachedClient
}

/** Read the prepaid balance over HTTP (read-only; safe before approval). */
export async function fetchBalance(): Promise<{ available: string; currency: string } | null> {
  const key = env().ZOOWORK_API_KEY
  if (!key) return null
  const base = (env().ZOOWORK_BASE_URL ?? DEFAULT_BASE).replace(/\/+$/, "")
  const res = await fetch(`${base}/balance`, { headers: { authorization: `Bearer ${key}` } })
  if (!res.ok) throw new Error(`ZooWork balance: HTTP ${res.status}`)
  const body = (await res.json()) as { available_amount?: string; currency?: string }
  return { available: body.available_amount ?? "0.00", currency: body.currency ?? "usd" }
}

async function readStoredAgentId(): Promise<string | undefined> {
  try {
    const raw = await readFile(AGENT_FILE, "utf8")
    const parsed = JSON.parse(raw) as { agentId?: string }
    return parsed.agentId
  } catch {
    return undefined
  }
}

async function storeAgentId(agentId: string): Promise<void> {
  await mkdir(dirname(AGENT_FILE), { recursive: true })
  await writeFile(AGENT_FILE, JSON.stringify({ agentId, storedAt: new Date().toISOString() }, null, 2))
}

/** An explicit alias if the operator pinned one; otherwise the platform's chat default. */
async function resolveModel(c: ZooworkClient): Promise<string | undefined> {
  const pinned = env().ZOOWORK_MODEL
  if (pinned) return pinned
  const models = await c.listModels()
  const fallback = models.find((m) => m.selectable !== false && m.default_for?.includes("model"))
  return fallback?.model
}

/**
 * One Agent per project, created at setup — never per message.
 * Reuse order: stored id → label discovery → create (idempotency key makes a retry converge).
 */
async function ensureAgent(c: ZooworkClient): Promise<{ agentId: string; reused: boolean }> {
  const stored = await readStoredAgentId()
  if (stored) {
    try {
      await c.getAgent(stored)
      return { agentId: stored, reused: true }
    } catch (error) {
      if (!(error instanceof ZooworkError) || error.status !== 404) throw error
      // stored id is gone or out of scope; fall through to discovery
    }
  }

  for await (const agent of c.listAgents({ labels: AGENT_LABELS })) {
    if (agent.agent_id) {
      await storeAgentId(agent.agent_id)
      return { agentId: agent.agent_id, reused: true }
    }
  }

  const model = await resolveModel(c)
  const created: AgentRecord = await c.createAgent(
    {
      resource: {
        name: AGENT_NAME,
        labels: AGENT_LABELS,
        ...(model ? { model: { primary: model } } : {}),
        persona: { docs: [{ name: "AGENTS.md", content: PERSONA }] },
        // No sandbox tools are needed to write an email; keep the surface small.
        tool_policy: {},
      },
    },
    "pull-demo-agent-v1",
  )
  await storeAgentId(created.agent_id)
  return { agentId: created.agent_id, reused: false }
}

async function ensureRunning(c: ZooworkClient, agentId: string): Promise<void> {
  try {
    await c.startAgent(agentId)
  } catch (error) {
    // A start on an already-running agent is not an error we need to surface.
    if (!(error instanceof ZooworkError)) throw error
    if (error.status !== 409) throw error
  }
  await c.waitUntilRunning(agentId, { timeoutMs: 30_000, intervalMs: 500 })
}

/** Read one turn, resuming nothing (each run is a fresh session). */
async function readTurn(
  c: ZooworkClient,
  agentId: string,
  sessionId: string,
  timeoutMs: number,
): Promise<{ text: string; outcome: string | undefined; cursor?: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let text = ""
  let cursor: string | undefined
  let outcome: string | undefined
  try {
    for await (const event of c.streamEvents(agentId, sessionId, { signal: controller.signal })) {
      const typed = event as SessionEvent
      cursor = typed.cursor ?? cursor
      text += assistantText(typed)
      if (isRunFinished(typed)) {
        outcome = runOutcome(typed)
        break
      }
    }
  } finally {
    clearTimeout(timer)
    controller.abort()
  }
  return { text, outcome, cursor }
}

function sessionKey(jobId: string, kind: string, prompt: string): string {
  const hash = createHash("sha256").update(prompt).digest("hex").slice(0, 12)
  return `pull-${jobId}-${kind}-${hash}`
}

export const zoowork: AgentProvider = {
  name: "zoowork",
  available: zooworkReady,
  async run(input: AgentTaskInput): Promise<AgentTaskResult> {
    const e = env()
    if (!zooworkConfigured()) throw new AgentNotConfiguredError("zoowork", "ZOOWORK_API_KEY")
    if (!zooworkEnabled()) {
      throw new Error(
        "ZooWork is connected but billing is not approved. Set ZOOWORK_ENABLED=true only after approving the plan; Agent tasks draw on the prepaid balance.",
      )
    }

    const c = client()
    const { agentId } = await ensureAgent(c)
    await ensureRunning(c, agentId)

    const prompt = input.json
      ? `${input.user}\n\nReturn valid JSON only.`
      : input.user
    const key = sessionKey("adhoc", "task", prompt)

    const session = await c.createSession(
      agentId,
      {
        initial_events: [{ type: "user.message", content: `${input.system}\n\n${prompt}` }],
        metadata: { app: "pull-demo" },
      },
      key,
    )

    const turn = await readTurn(c, agentId, session.session_id, input.timeoutMs ?? 120_000)
    if (turn.outcome !== "succeeded") {
      throw new Error(`ZooWork run did not succeed: ${turn.outcome ?? "stream closed before run.finished"}`)
    }

    let json: unknown
    if (input.json) {
      try {
        json = JSON.parse(turn.text)
      } catch {
        json = undefined
      }
    }
    const model = (await c.getAgent(agentId)).declared?.model as { primary?: string } | undefined
    return {
      provider: "zoowork",
      model: model?.primary ?? "platform-default",
      text: turn.text,
      json,
      agentId,
      sessionId: session.session_id,
      cursor: turn.cursor,
    }
  },
}

/** Setup helper for the approval step: shows what would be created without creating it. */
export async function zooworkPlan(): Promise<{
  configured: boolean
  enabled: boolean
  balance: { available: string; currency: string } | null
  storedAgentId?: string
  wouldCreate: boolean
}> {
  const storedAgentId = await readStoredAgentId()
  let balance: { available: string; currency: string } | null = null
  if (zooworkConfigured()) {
    try {
      balance = await fetchBalance()
    } catch {
      balance = null
    }
  }
  return {
    configured: zooworkConfigured(),
    enabled: zooworkEnabled(),
    balance,
    storedAgentId,
    wouldCreate: !storedAgentId,
  }
}
