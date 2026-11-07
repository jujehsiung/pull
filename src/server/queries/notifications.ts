/**
 * What is waiting on the stylist.
 *
 * There is no notifications table: the client's review stamps
 * `jobs.reviewSubmittedAt`, and the bell is "submitted since the stylist last
 * acknowledged it" — `reviewSeenAt < reviewSubmittedAt`. One source of truth,
 * no rows to keep in sync, and a re-published board notifies again.
 */
import { and, desc, eq, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm"

import { db } from "@/db/client"
import { jobs, looks } from "@/db/schema"

export interface ReviewNotice {
  jobId: string
  /** The job, e.g. "Dune Tour". */
  title: string
  /** The client who approved, e.g. "Timothée Chalamet". */
  clientName: string
  approved: number
  passed: number
  /** Already formatted for display, e.g. "Nov 6, 10:42 PM". */
  submittedAt: string
  href: string
}

function stamp(date: Date): string {
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

/** Reviewed boards the stylist has not seen yet, newest first. */
export async function unreadReviews(stylistId: string, limit = 10): Promise<ReviewNotice[]> {
  const reviewed = await db()
    .select({
      id: jobs.id,
      title: jobs.title,
      clientName: jobs.clientName,
      submittedAt: jobs.reviewSubmittedAt,
    })
    .from(jobs)
    .where(
      and(
        eq(jobs.userId, stylistId),
        isNotNull(jobs.reviewSubmittedAt),
        or(isNull(jobs.reviewSeenAt), lt(jobs.reviewSeenAt, jobs.reviewSubmittedAt)),
      ),
    )
    .orderBy(desc(jobs.reviewSubmittedAt))
    .limit(limit)

  if (reviewed.length === 0) return []

  const counts = await db()
    .select({
      jobId: looks.jobId,
      status: looks.status,
      count: sql<number>`count(*)::int`,
    })
    .from(looks)
    .where(inArray(looks.jobId, reviewed.map((row) => row.id)))
    .groupBy(looks.jobId, looks.status)

  return reviewed.map((row) => {
    const forJob = counts.filter((count) => count.jobId === row.id)
    const of = (status: string) => forJob.find((count) => count.status === status)?.count ?? 0
    return {
      jobId: row.id,
      title: row.title,
      clientName: row.clientName,
      approved: of("approved"),
      passed: of("passed"),
      submittedAt: row.submittedAt ? stamp(row.submittedAt) : "",
      href: `/studio/jobs/${row.id}/requests`,
    }
  })
}
