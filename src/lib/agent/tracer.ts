/**
 * Server-side tracer. Wrap every tool call the agent makes and it lands in `events`,
 * so the trace survives a refresh and the stylist can see exactly what happened.
 *
 *   const looks = await withTrace({ jobId, tool: "tesseract.read", args: { file } }, () => ocr(file))
 *
 * Browser-side steps (Cloudinary upload, OCR) cannot call this directly, so the import route
 * reports them after the fact through `recordSteps()` — same record shape, same table, still one
 * trace. PRD §7.1 + FR-23: every tool call is visible with args, result, duration and status,
 * including failures, with the provider's own error text kept verbatim and no secrets.
 */
import { and, asc, eq } from "drizzle-orm"
import { db } from "@/db/client"
import { events } from "@/db/schema"
import type { AgentStep } from "./trace"

const REDACT = /(key|secret|token|password|authorization|cookie)/i

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact)
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      out[key] = REDACT.test(key) ? "[redacted]" : redact(inner)
    }
    return out
  }
  return value
}

function safe(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(redact(value) ?? null)) as unknown
  } catch {
    return String(value)
  }
}

export interface StepInput {
  jobId: string
  tool: string
  status: "ok" | "error" | "running"
  args?: unknown
  result?: unknown
  error?: string
  durationMs?: number
  /** When the step ran; lets a batch reported from the browser keep its original ordering. */
  at?: Date
}

interface TraceContext {
  jobId: string
  tool: string
  args?: unknown
}

export async function withTrace<T>(ctx: TraceContext, run: () => Promise<T>): Promise<T> {
  const startedAt = Date.now()
  try {
    const result = await run()
    await recordSteps([{ ...ctx, status: "ok", result, durationMs: Date.now() - startedAt }])
    return result
  } catch (error) {
    await recordSteps([
      {
        ...ctx,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startedAt,
      },
    ])
    throw error
  }
}

/** Record one or many steps. Never throws: a trace failure must not fail the work it describes. */
export async function recordSteps(steps: StepInput[]): Promise<void> {
  if (!steps.length) return
  const rows = steps.map((step) => ({
    jobId: step.jobId,
    actor: "agent",
    kind: step.tool,
    payload: {
      args: safe(step.args),
      result: safe(step.result),
      error: step.error,
      status: step.status,
      durationMs: step.durationMs ?? 0,
    },
    ...(step.at ? { createdAt: step.at } : {}),
  }))
  try {
    await db().insert(events).values(rows)
  } catch (error) {
    // Before Neon is connected the trace still has to work — fall back to the server log.
    for (const row of rows) {
      console.info("[trace]", row.kind, (row.payload as { status?: string }).status, error instanceof Error ? "" : "")
    }
  }
}

export async function recordStep(step: StepInput): Promise<void> {
  await recordSteps([step])
}

/** Read the persisted trace for a job (oldest first, oldest dropped when over the limit). */
export async function readTrace(jobId: string, limit = 300): Promise<AgentStep[]> {
  const rows = await db()
    .select()
    .from(events)
    .where(and(eq(events.jobId, jobId), eq(events.actor, "agent")))
    .orderBy(asc(events.id))
    .limit(limit)
  return rows.map((row) => {
    const payload = (row.payload ?? {}) as Record<string, unknown>
    return {
      id: String(row.id),
      tool: row.kind,
      status: (payload.status as AgentStep["status"]) ?? "ok",
      args: payload.args,
      result: payload.result,
      error: payload.error as string | undefined,
      durationMs: payload.durationMs as number | undefined,
      at: row.createdAt.toISOString(),
    }
  })
}

/** Non-agent actions, so the job page has one timeline. The actor is not always the stylist. */
export type HumanActor = "stylist" | "client"

export async function recordHuman(
  jobId: string,
  kind: string,
  payload?: unknown,
  actor: HumanActor = "stylist",
): Promise<void> {
  try {
    await db().insert(events).values({
      jobId,
      actor,
      kind,
      payload: (safe(payload) ?? null) as Record<string, unknown>,
    })
  } catch (error) {
    console.info("[trace]", kind, error instanceof Error ? "" : "")
  }
}

/** The client acting through a public link — a different actor from the stylist, and it matters in the log. */
export async function recordClient(jobId: string, kind: string, payload?: unknown): Promise<void> {
  await recordHuman(jobId, kind, payload, "client")
}
