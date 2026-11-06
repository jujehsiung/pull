/** Read-side queries for the studio. Every one takes the stylist id — no query trusts a client id. */
import { and, asc, desc, eq } from "drizzle-orm"
import { db } from "@/db/client"
import { boards, jobs, looks } from "@/db/schema"

export type JobRow = typeof jobs.$inferSelect
export type BoardRow = typeof boards.$inferSelect
export type LookRow = typeof looks.$inferSelect

export async function listJobs(userId: string): Promise<JobRow[]> {
  return db().select().from(jobs).where(eq(jobs.userId, userId)).orderBy(desc(jobs.createdAt))
}

/** A job plus its visible boards and looks, ordered for the studio board grid. */
export async function getJobBoard(userId: string, jobId: string) {
  const [job] = await db()
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.userId, userId)))
    .limit(1)
  if (!job) return null

  const [boardRows, allLooks] = await Promise.all([
    db().select().from(boards).where(eq(boards.jobId, jobId)).orderBy(asc(boards.position), asc(boards.brand)),
    db().select().from(looks).where(eq(looks.jobId, jobId)).orderBy(asc(looks.position), asc(looks.lookNo)),
  ])
  // FR-6: a hidden look is out of the client board but still in the studio, so the stylist can
  // put it back until the job is published.
  const lookRows = allLooks.filter((look) => !look.hiddenAt)
  const hiddenLooks = allLooks.filter((look) => look.hiddenAt)

  const looksByBoard = new Map<string, LookRow[]>()
  for (const look of lookRows) {
    const list = looksByBoard.get(look.boardId) ?? []
    list.push(look)
    looksByBoard.set(look.boardId, list)
  }

  return {
    job,
    boards: boardRows.map((board) => ({ ...board, looks: looksByBoard.get(board.id) ?? [] })),
    /** Looks whose board row is missing should not vanish silently. */
    orphanLooks: lookRows.filter((look) => !boardRows.some((board) => board.id === look.boardId)),
    visibleLookCount: lookRows.length,
    hiddenLooks,
  }
}

export async function getJob(userId: string, jobId: string): Promise<JobRow | null> {
  const [job] = await db()
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.userId, userId)))
    .limit(1)
  return job ?? null
}
