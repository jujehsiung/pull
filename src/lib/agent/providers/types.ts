/** The provider contract every agent backend satisfies. Server-side only. */
export type ProviderName = "deterministic" | "deepseek" | "zoowork"

export interface AgentTaskInput {
  system: string
  user: string
  /** Ask the model for a JSON object; providers that support it set response_format. */
  json?: boolean
  maxTokens?: number
  timeoutMs?: number
}

export interface AgentTaskResult {
  provider: ProviderName
  model: string
  text: string
  /** Parsed JSON when `json` was requested and parsing succeeded. */
  json?: unknown
  usage?: unknown
  /** Present for managed-agent runs. */
  agentId?: string
  sessionId?: string
  cursor?: string
}

export interface AgentProvider {
  name: ProviderName
  available(): boolean
  run(input: AgentTaskInput): Promise<AgentTaskResult>
}

export class AgentNotConfiguredError extends Error {
  constructor(provider: ProviderName, missing: string) {
    super(`${provider} is not configured: set ${missing}`)
    this.name = "AgentNotConfiguredError"
  }
}
