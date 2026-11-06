/**
 * Act 1, step 1 — mint a short-lived Cloudinary direct-upload signature for one job.
 *
 * The browser uploads the bytes straight to Cloudinary (PRD §9.1), so this route returns only the
 * signed parameters. Session is verified here; the batch route re-verifies ownership before writing
 * anything, because the browser cannot be trusted with a jobId.
 */
import { and, eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { db } from "@/db/client"
import { jobs } from "@/db/schema"
import { getStylist } from "@/lib/auth"
import { signedUpload } from "@/lib/cloudinary"

export const runtime = "nodejs"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  const stylist = await getStylist()
  if (!stylist) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 })
  }

  const jobId = typeof (body as { jobId?: unknown } | null)?.jobId === "string" ? (body as { jobId: string }).jobId : ""
  if (!UUID_RE.test(jobId)) {
    return NextResponse.json({ error: "jobId must be a job UUID" }, { status: 400 })
  }

  const [job] = await db()
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.userId, stylist.id)))
    .limit(1)
  if (!job) return NextResponse.json({ error: "job not found" }, { status: 404 })

  try {
    return NextResponse.json(signedUpload(`pull/jobs/${jobId}`))
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Cloudinary is not configured" },
      { status: 500 },
    )
  }
}
