import { NextResponse } from "next/server"
import { getStylist } from "@/lib/auth"
import { readTrace } from "@/lib/agent/tracer"
import { getJob } from "@/server/queries/jobs"

/**
 * The trace panel's data source. The page server-renders the first paint; this route lets it stay
 * live during an import without a full reload. Polled at ~1.5 s, which satisfies FR-23's
 * "visible within 1 s of completing" without holding an SSE connection open on a demo laptop.
 */
export async function GET(request: Request) {
  const stylist = await getStylist()
  if (!stylist) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const jobId = new URL(request.url).searchParams.get("jobId")
  if (!jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 })

  const job = await getJob(stylist.id, jobId)
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 })

  const steps = await readTrace(jobId)
  return NextResponse.json({ steps }, { headers: { "cache-control": "no-store" } })
}
