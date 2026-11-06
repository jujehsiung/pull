/**
 * DeepSeek provider — OpenAI-compatible chat completions.
 * Used for the pre-credit demo so the AI path is real while ZooWork credits are pending.
 * Key resolution is server-side only: never import this from a client component.
 */
import { env } from "../../env"
import {
  AgentNotConfiguredError,
  type AgentProvider,
  type AgentTaskInput,
  type AgentTaskResult,
} from "./types"

const DEFAULT_BASE = "https://api.deepseek.com"
const DEFAULT_MODEL = "deepseek-chat"

export function deepseekConfigured(): boolean {
  return Boolean(env().DEEPSEEK_API_KEY)
}

interface Choice {
  message?: { content?: string | null }
  finish_reason?: string
}

interface CompletionResponse {
  choices?: Choice[]
  usage?: unknown
  error?: { message?: string; type?: string }
}

export const deepseek: AgentProvider = {
  name: "deepseek",
  available: deepseekConfigured,
  async run(input: AgentTaskInput): Promise<AgentTaskResult> {
    const e = env()
    if (!e.DEEPSEEK_API_KEY) throw new AgentNotConfiguredError("deepseek", "DEEPSEEK_API_KEY")

    const base = (e.DEEPSEEK_BASE_URL ?? DEFAULT_BASE).replace(/\/+$/, "")
    const model = e.DEEPSEEK_MODEL ?? DEFAULT_MODEL

    const response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${e.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.user },
        ],
        temperature: 0.2,
        ...(input.maxTokens ? { max_tokens: input.maxTokens } : {}),
        ...(input.json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: AbortSignal.timeout(input.timeoutMs ?? 60_000),
    })

    const body = (await response.json().catch(() => ({}))) as CompletionResponse
    if (!response.ok) {
      throw new Error(`DeepSeek ${response.status}: ${body.error?.message ?? "request failed"}`)
    }

    const text = body.choices?.[0]?.message?.content ?? ""
    let json: unknown
    if (input.json) {
      try {
        json = JSON.parse(text)
      } catch {
        json = undefined
      }
    }
    return { provider: "deepseek", model, text, json, usage: body.usage }
  },
}
