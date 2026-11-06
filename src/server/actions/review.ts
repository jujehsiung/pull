/**
 * Mutations for the public client review (Act 2, FR-10 + FR-11).
 *
 * Every export is a server action and every one re-runs the full token authorisation
 * (`authorizeClientToken`) before touching a row. A token, jobId or lookId arriving from the
 * browser is only ever used as a lookup key **inside** the job that token proved ownership of —
 * a lookId belonging to another job can never be updated.
 *
 * Two flavours are exported on purpose:
 *   - `setLookDecision` / `setLookPriority` / `setLookNote` / `submitReview` are the authoritative
 *     actions (explicit arguments, used by the optimistic client controls).
 *   - `*Form` wrappers take a FormData and are bound to <form action> — that is what makes the
 *     review work without JavaScript and lets the actions be exercised with curl.
 *
 * Per-action persistence is the FR-10 acceptance criterion: one click = one row change, no batching
 * until submit. Submit is the only thing that closes the review, and it stamps `reviewSubmittedAt`
 * exactly once (the update is conditional on it still being NULL).
 */
"use server"

import { and, eq, isNull } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { db } from "@/db/client"
import { jobs, looks } from "@/db/schema"
import { recordClient } from "@/lib/agent/tracer"
import { ensureDrafts } from "@/server/requests/drafts"
import { authorizeClientToken, isReviewOpen, reviewCounts, type ReviewCounts } from "@/server/queries/review"

export type LookDecision = "draft" | "approved" | "passed"

const DECISIONS: readonly LookDecision[] = ["draft", "approved", "passed"]
const MAX_NOTE = 2000

export interface ReviewActionResult {
  ok: boolean
  error?: string
  /** True when the caller was rejected because the review is closed (FR-11), not because of bad input. */
  locked?: boolean
}

export interface SubmitReviewResult extends ReviewActionResult {
  submittedAt?: string
  counts?: ReviewCounts
}

/** The board, its summary, and the stylist's report all change together. */
function revalidateClient(token: string, jobId: string): void {
  revalidatePath(`/b/${token}`)
  revalidatePath(`/b/${token}/review`)
  revalidatePath(`/studio/jobs/${jobId}`)
}

/**
 * Authorise + find the look *within this job's visible looks*. `ctx.looks` was loaded by job id and
 * filtered by hiddenAt, so this single check proves both ownership and visibility.
 */
async function openContext(token: string) {
  const ctx = await authorizeClientToken(token, { requireOpen: true })
  if (!ctx) return null
  return ctx
}

function closed(): ReviewActionResult {
  return { ok: false, locked: true, error: "This review is closed." }
}

/** FR-10: approve / pass / clear. Leaving "approved" always clears the priority (see setLookPriority). */
export async function setLookDecision(
  token: string,
  lookId: string,
  status: LookDecision,
): Promise<ReviewActionResult> {
  if (!DECISIONS.includes(status)) return { ok: false, error: "Unknown decision." }

  const ctx = await openContext(token)
  if (!ctx) return closed()
  const look = ctx.looks.find((row) => row.id === lookId)
  if (!look) return { ok: false, error: "Look not found." }

  const patch: Partial<typeof looks.$inferInsert> = { status }
  // A priority only means something on an approved look; dropping it here keeps the DB honest.
  if (status !== "approved") patch.priority = null

  // jobId is in the predicate as well as the lookup: belt and braces against a crafted lookId.
  await db()
    .update(looks)
    .set(patch)
    .where(and(eq(looks.id, lookId), eq(looks.jobId, ctx.job.id), isNull(looks.hiddenAt)))

  revalidateClient(token, ctx.job.id)
  return { ok: true }
}

/** FR-10: 1–3 stars on an approved look; null clears. Rejected on anything not approved. */
export async function setLookPriority(
  token: string,
  lookId: string,
  priority: 1 | 2 | 3 | null,
): Promise<ReviewActionResult> {
  if (priority !== null && !(Number.isInteger(priority) && priority >= 1 && priority <= 3)) {
    return { ok: false, error: "Priority must be 1–3 stars." }
  }

  const ctx = await openContext(token)
  if (!ctx) return closed()
  const look = ctx.looks.find((row) => row.id === lookId)
  if (!look) return { ok: false, error: "Look not found." }
  if (look.status !== "approved") return { ok: false, error: "Approve the look before starring it." }

  await db()
    .update(looks)
    .set({ priority })
    .where(and(eq(looks.id, lookId), eq(looks.jobId, ctx.job.id), isNull(looks.hiddenAt)))

  revalidateClient(token, ctx.job.id)
  return { ok: true }
}

/** FR-10: free-text note. Trimmed; empty clears it. Length capped server-side. */
export async function setLookNote(
  token: string,
  lookId: string,
  note: string,
): Promise<ReviewActionResult> {
  if (typeof note !== "string") return { ok: false, error: "That note could not be read." }
  const trimmed = note.trim()
  if (trimmed.length > MAX_NOTE) return { ok: false, error: `Notes are limited to ${MAX_NOTE} characters.` }

  const ctx = await openContext(token)
  if (!ctx) return closed()
  const look = ctx.looks.find((row) => row.id === lookId)
  if (!look) return { ok: false, error: "Look not found." }

  await db()
    .update(looks)
    .set({ clientNote: trimmed || null })
    .where(and(eq(looks.id, lookId), eq(looks.jobId, ctx.job.id), isNull(looks.hiddenAt)))

  revalidateClient(token, ctx.job.id)
  return { ok: true }
}

/**
 * FR-11: submit once. The UPDATE is conditional on status still being "published" and
 * reviewSubmittedAt still NULL, so a double click, a stale tab, or a replayed form cannot move the
 * timestamp. If it no longer applies, the review was already closed — report locked.
 */
export async function submitReview(token: string): Promise<SubmitReviewResult> {
  const ctx = await authorizeClientToken(token, { requireOpen: true })
  if (!ctx) return { ok: false, locked: true, error: "This review is already closed." }
  if (!isReviewOpen(ctx.job)) return closed()

  const counts = reviewCounts(ctx.looks)
  const [updated] = await db()
    .update(jobs)
    .set({ status: "client_reviewed", reviewSubmittedAt: new Date() })
    .where(
      and(
        eq(jobs.id, ctx.job.id),
        eq(jobs.status, "published"),
        isNull(jobs.reviewSubmittedAt),
      ),
    )
    .returning({ id: jobs.id, reviewSubmittedAt: jobs.reviewSubmittedAt })

  if (!updated) return { ok: false, locked: true, error: "This review was already submitted." }

  // The client is a distinct actor in the audit trail, never the stylist (recordClient sets it).
  await recordClient(ctx.job.id, "review.submitted", { counts })

  // FR-13 wants the per-brand drafts within 10 s of the client submitting. Drafting is a
  // convenience: a failure here must never fail the submission the client just made. If the
  // stylist pressed "Draft requests" first, ensureDrafts is idempotent and returns skipped: true.
  try {
    await ensureDrafts(ctx.job.id)
  } catch {
    // Swallow on purpose (see above).
  }

  revalidateClient(token, ctx.job.id)
  return { ok: true, submittedAt: updated.reviewSubmittedAt?.toISOString(), counts }
}

// ── form wrappers: no-JS + curl-testable ────────────────────────────────────────────────────────
// No redirect: a server action bound to <form action> that only revalidates returns the updated
// page in place, so a decision does not throw the client to the top of a long board. Submitting the
// review is the one exception — that navigates back to the (now locked) board.

export async function setLookDecisionForm(form: FormData): Promise<void> {
  const token = String(form.get("token") ?? "")
  const lookId = String(form.get("lookId") ?? "")
  const status = String(form.get("status") ?? "") as LookDecision
  await setLookDecision(token, lookId, status)
}

export async function setLookPriorityForm(form: FormData): Promise<void> {
  const token = String(form.get("token") ?? "")
  const lookId = String(form.get("lookId") ?? "")
  const raw = String(form.get("priority") ?? "")
  const priority = raw === "" ? null : Number(raw)
  if (priority !== null && ![1, 2, 3].includes(priority)) return
  await setLookPriority(token, lookId, priority as 1 | 2 | 3 | null)
}

export async function setLookNoteForm(form: FormData): Promise<void> {
  const token = String(form.get("token") ?? "")
  const lookId = String(form.get("lookId") ?? "")
  const note = String(form.get("note") ?? "")
  await setLookNote(token, lookId, note)
}

/** FR-11 confirm button: close the review, then show the client the locked board. */
export async function submitReviewForm(form: FormData): Promise<void> {
  const token = String(form.get("token") ?? "")
  await submitReview(token)
  redirect(`/b/${token}`)
}
