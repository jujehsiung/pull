/**
 * Read + authorisation side of the public client review (Act 2, FR-9/10/11/12).
 *
 * The board URL is the only credential a client has, so this helper is the single gate every page
 * and every mutation goes through. It re-verifies, on the server, on every call:
 *
 *   1. the HMAC signature (verifyLink) and that its scope is "client";
 *   2. the job exists and has been published (`publishedAt` set);
 *   3. the presented token's sha256 is the hash stored at publish time — so re-minting or clearing
 *      `publicTokenHash` revokes the link without rotating LINK_SECRET;
 *   4. for mutations, that the review is still open (status "published", nothing submitted yet).
 *
 * It returns only the *visible* looks of that job, ordered for the board. Callers must still prove
 * any lookId they receive belongs to `ctx.looks` — a lookId from the browser is never trusted.
 */
import { and, asc, eq, isNull } from "drizzle-orm"
import { db } from "@/db/client"
import { boards, jobs, looks } from "@/db/schema"
import { verifyLink } from "@/lib/auth"
import { tokenHashMatches } from "@/app/b/[token]/token"

export type JobRow = typeof jobs.$inferSelect
export type BoardRow = typeof boards.$inferSelect
export type LookRow = typeof looks.$inferSelect

export interface ClientReviewContext {
  job: JobRow
  boards: BoardRow[]
  /** Visible looks only (FR-6), already ordered by board position then look position. */
  looks: LookRow[]
}

export interface AuthorizeOptions {
  /** Mutations set this: once the client submits, FR-11 locks every further edit. */
  requireOpen?: boolean
}

/** FR-11: a review is open only while the job is published and nothing has been submitted. */
export function isReviewOpen(job: Pick<JobRow, "status" | "reviewSubmittedAt">): boolean {
  return job.status === "published" && job.reviewSubmittedAt === null
}

export async function authorizeClientToken(
  rawToken: string,
  options: AuthorizeOptions = {},
): Promise<ClientReviewContext | null> {
  if (!rawToken) return null

  const link = verifyLink(rawToken)
  if (!link || link.scope !== "client") return null

  try {
    const database = db()
    const [job] = await database.select().from(jobs).where(eq(jobs.id, link.id)).limit(1)
    if (!job || job.publishedAt === null) return null
    if (!tokenHashMatches(rawToken, job.publicTokenHash)) return null
    if (options.requireOpen && !isReviewOpen(job)) return null

    const [boardRows, lookRows] = await Promise.all([
      database
        .select()
        .from(boards)
        .where(eq(boards.jobId, job.id))
        .orderBy(asc(boards.position), asc(boards.createdAt)),
      database
        .select()
        .from(looks)
        .where(and(eq(looks.jobId, job.id), isNull(looks.hiddenAt)))
        .orderBy(asc(looks.position), asc(looks.lookNo)),
    ])

    return { job, boards: boardRows, looks: lookRows }
  } catch (error) {
    // A DB failure must never render a partial board or admit a mutation.
    console.error("[client-review] authorisation failed", error)
    return null
  }
}

/** Board sections in board order, with empty brands dropped (same shape as the board page). */
export function sectionsFor(ctx: ClientReviewContext) {
  const byBoard = new Map<string, LookRow[]>()
  for (const look of ctx.looks) {
    const list = byBoard.get(look.boardId)
    if (list) list.push(look)
    else byBoard.set(look.boardId, [look])
  }
  return ctx.boards
    .map((board) => ({ board, looks: byBoard.get(board.id) ?? [] }))
    .filter((section) => section.looks.length > 0)
}

export interface ReviewCounts {
  approved: number
  passed: number
  undecided: number
  /** FR-12's "priority shortlist": approved with 2–3 stars, matching getReviewReport. */
  mustHaves: number
  total: number
}

export function reviewCounts(lookRows: Pick<LookRow, "status" | "priority">[]): ReviewCounts {
  let approved = 0
  let passed = 0
  let mustHaves = 0
  for (const look of lookRows) {
    if (look.status === "approved") {
      approved += 1
      if ((look.priority ?? 0) >= 2) mustHaves += 1
    } else if (look.status === "passed") {
      passed += 1
    }
  }
  return {
    approved,
    passed,
    undecided: lookRows.length - approved - passed,
    mustHaves,
    total: lookRows.length,
  }
}
