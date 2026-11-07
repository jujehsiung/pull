/**
 * Acknowledging a review. Opening the notification is the acknowledgement: it
 * stamps `reviewSeenAt` and lands the stylist on the requests page, which is
 * where the agent drafts the showroom emails.
 */
"use server"

import { and, eq, isNull, lt, or } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { db } from "@/db/client"
import { jobs } from "@/db/schema"
import { requireStylist } from "@/lib/auth"

/** The header badge lives in the root layout, so the whole tree revalidates. */
function refreshHeader() {
  revalidatePath("/", "layout")
}

export async function markReviewSeenForm(form: FormData): Promise<void> {
  const stylist = await requireStylist()
  const jobId = String(form.get("jobId") ?? "")

  if (jobId) {
    await db()
      .update(jobs)
      .set({ reviewSeenAt: new Date() })
      .where(and(eq(jobs.id, jobId), eq(jobs.userId, stylist.id)))
  }

  refreshHeader()
  redirect(jobId ? `/studio/jobs/${jobId}/requests` : "/studio")
}

export async function markAllReviewsSeenForm(): Promise<void> {
  const stylist = await requireStylist()

  await db()
    .update(jobs)
    .set({ reviewSeenAt: new Date() })
    .where(
      and(
        eq(jobs.userId, stylist.id),
        or(isNull(jobs.reviewSeenAt), lt(jobs.reviewSeenAt, jobs.reviewSubmittedAt)),
      ),
    )

  refreshHeader()
  redirect("/studio")
}
