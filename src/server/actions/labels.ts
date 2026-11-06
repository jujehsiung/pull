/**
 * Studio-side label actions (FR-19, FR-20, FR-21).
 *
 * Form actions, so the LabelPanel stays a server component and every button works without JS (and
 * is curl-testable). Each call re-reads the request and its job by the signed-in stylist's id — a
 * requestId from the browser is never trusted. Outcomes come back as the requests page's existing
 * flash banners (`?note=` / `?error=`), which the lead's page already renders.
 *
 * The purchase gate lives in `buyLabel` (src/lib/shippo.ts); these actions do not bypass it.
 */
"use server"

import { and, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { db } from "@/db/client"
import { jobs, requests } from "@/db/schema"
import { requireStylist } from "@/lib/auth"
import { chooseRate, purchaseLabel, refreshTracking, sendLabel } from "@/server/requests/labels"

async function ownedRequest(stylistId: string, requestId: string) {
  if (!requestId) return null
  const [request] = await db().select().from(requests).where(eq(requests.id, requestId)).limit(1)
  if (!request) return null
  const [job] = await db()
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, request.jobId), eq(jobs.userId, stylistId)))
    .limit(1)
  return job ? { request, job } : null
}

function back(jobId: string, query = ""): never {
  revalidatePath(`/studio/jobs/${jobId}/requests`)
  revalidatePath(`/studio/jobs/${jobId}`)
  redirect(`/studio/jobs/${jobId}/requests${query}`)
}

function fail(jobId: string, message: string): never {
  back(jobId, `?error=${encodeURIComponent(message)}`)
}

function succeed(jobId: string, message: string): never {
  back(jobId, `?note=${encodeURIComponent(message)}`)
}

export async function chooseRateForm(form: FormData): Promise<void> {
  const stylist = await requireStylist()
  const requestId = String(form.get("requestId") ?? "")
  const rateId = String(form.get("rateId") ?? "")
  const owned = await ownedRequest(stylist.id, requestId)
  if (!owned) redirect("/studio")

  const result = await chooseRate(requestId, rateId)
  if (!result.ok) fail(owned.job.id, result.error ?? "Could not choose that rate.")
  succeed(owned.job.id, `${owned.request.brand} — ${result.message ?? "Rate chosen."}`)
}

export async function purchaseLabelForm(form: FormData): Promise<void> {
  const stylist = await requireStylist()
  const requestId = String(form.get("requestId") ?? "")
  const owned = await ownedRequest(stylist.id, requestId)
  if (!owned) redirect("/studio")

  const result = await purchaseLabel(requestId)
  if (!result.ok) fail(owned.job.id, result.error ?? "The label was not bought.")
  succeed(owned.job.id, `${owned.request.brand} — ${result.message ?? "Label bought."}`)
}

export async function sendLabelForm(form: FormData): Promise<void> {
  const stylist = await requireStylist()
  const requestId = String(form.get("requestId") ?? "")
  const owned = await ownedRequest(stylist.id, requestId)
  if (!owned) redirect("/studio")

  const result = await sendLabel(requestId)
  if (!result.ok) fail(owned.job.id, result.error ?? "The label email was not sent.")
  succeed(owned.job.id, `${owned.request.brand} — ${result.message ?? "Label sent."}`)
}

export async function refreshTrackingForm(form: FormData): Promise<void> {
  const stylist = await requireStylist()
  const requestId = String(form.get("requestId") ?? "")
  const owned = await ownedRequest(stylist.id, requestId)
  if (!owned) redirect("/studio")

  const result = await refreshTracking(requestId)
  if (!result.ok) fail(owned.job.id, result.error ?? "Tracking could not be refreshed.")
  succeed(owned.job.id, `${owned.request.brand} — ${result.message ?? "Tracking refreshed."}`)
}
