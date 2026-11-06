import { NextResponse } from "next/server"
import { agentStatus } from "@/lib/agent"
import { zooworkPlan } from "@/lib/agent/providers/zoowork"

export const dynamic = "force-dynamic"

/**
 * GET /api/agent/status — which inference backend is active.
 * Read-only: it never creates or starts an Agent, so it is safe to call before billing approval.
 */
export async function GET() {
  const status = agentStatus()
  const plan = await zooworkPlan().catch(() => null)
  return NextResponse.json({
    ...status,
    zooworkPlan: plan,
    note:
      status.active === "deterministic"
        ? "No AI provider configured. Add DEEPSEEK_API_KEY to .env.local (pre-credit demo) or fund ZooWork."
        : `Active provider: ${status.active}.`,
  })
}
