/**
 * Agent runtime selection (server-side only).
 *
 * Precedence: AGENT_PROVIDER if set, otherwise the first configured provider:
 *   zoowork (managed agents, needs credits)  >  deepseek (pre-credit demo)  >  deterministic.
 * Every call is traced, so the trace page shows which backend ran and how long it took.
 */
import { withTrace } from "./tracer"
import { deepseek } from "./providers/deepseek"
import { zoowork, zooworkConfigured, zooworkEnabled } from "./providers/zoowork"
import { env } from "../env"
import type { AgentProvider, AgentTaskInput, AgentTaskResult, ProviderName } from "./providers/types"

export { deepseek } from "./providers/deepseek"
export { zoowork, zooworkPlan, fetchBalance } from "./providers/zoowork"
export type { AgentTaskInput, AgentTaskResult, ProviderName } from "./providers/types"

const PROVIDERS: Record<Exclude<ProviderName, "deterministic">, AgentProvider> = {
  zoowork,
  deepseek,
}

export function activeProvider(): ProviderName {
  const forced = env().AGENT_PROVIDER as ProviderName | undefined
  if (forced && forced !== "deterministic") {
    const provider = PROVIDERS[forced as Exclude<ProviderName, "deterministic">]
    if (provider) return provider.name
  }
  if (zoowork.available()) return "zoowork"
  if (deepseek.available()) return "deepseek"
  return "deterministic"
}

export function agentStatus() {
  return {
    active: activeProvider(),
    forced: env().AGENT_PROVIDER ?? null,
    deepseek: {
      configured: deepseek.available(),
      model: env().DEEPSEEK_MODEL ?? "deepseek-chat",
    },
    zoowork: {
      configured: zoowork.available(),
      enabled: zooworkEnabled(),
      model: env().ZOOWORK_MODEL ?? "platform default",
      note: zoowork.available()
        ? "ready — Agent tasks draw on the organization's prepaid balance"
        : zooworkConfiguredCheck(),
    },
    deterministicFallback: true,
  }
}

function zooworkConfiguredCheck(): string {
  return "not enabled: set ZOOWORK_API_KEY and approve billing (ZOOWORK_ENABLED=true)"
}

/** Run one task on the configured provider, traced. Throws when no provider is configured. */
export async function runAgentTask(
  input: AgentTaskInput,
  ctx?: { jobId?: string; kind?: string },
): Promise<AgentTaskResult> {
  const name = activeProvider()
  if (name === "deterministic" || !PROVIDERS[name]) {
    throw new Error(
      "No AI provider configured. Set DEEPSEEK_API_KEY (pre-credit) or ZOOWORK_API_KEY + ZOOWORK_ENABLED=true.",
    )
  }
  const provider = PROVIDERS[name as Exclude<ProviderName, "deterministic">]
  const tool = `${name}.run`

  if (ctx?.jobId) {
    return withTrace(
      { jobId: ctx.jobId, tool, args: { kind: ctx.kind, json: Boolean(input.json), provider: name } },
      () => provider.run(input),
    )
  }
  return provider.run(input)
}
