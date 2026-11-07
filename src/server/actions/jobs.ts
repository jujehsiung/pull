/**
 * Mutations for Act 1. Server actions only — every one re-reads the job and checks the stylist id
 * before touching a row, because the browser sends ids it should not be trusted with.
 *
 * PRD: FR-1 (job creation + date validation), FR-6 (hide/restore a look), FR-7 (publish),
 * FR-8 (send the link), FR-22 (activity log).
 */
"use server"

import { and, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { db } from "@/db/client"
import { emails, jobs, looks } from "@/db/schema"
import { mintClientLink, requireStylist, sha256 } from "@/lib/auth"
import { recordHuman, recordSteps } from "@/lib/agent/tracer"
import { sendEmail } from "@/lib/resend"
import { publicBoardPath } from "@/lib/share"
import { isIsoDate, validateJobDates } from "@/lib/job-dates"

export interface ActionResult {
  ok: boolean
  error?: string
  detail?: string
}

export async function createJob(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const stylist = await requireStylist()
  const clientName = String(form.get("clientName") ?? "").trim()
  const title = String(form.get("title") ?? "").trim()
  const shootDate = String(form.get("shootDate") ?? "")
  const callInDate = String(form.get("callInDate") ?? "")
  const returnDate = String(form.get("returnDate") ?? "")

  if (!clientName) return { ok: false, error: "Client name is required." }
  if (!title) return { ok: false, error: "Job name is required." }
  const dateError = validateJobDates(callInDate, shootDate, returnDate)
  if (dateError) return { ok: false, error: dateError }

  const [job] = await db()
    .insert(jobs)
    .values({ userId: stylist.id, clientName, title, shootDate, callInDate, returnDate, status: "draft" })
    .returning()

  await recordHuman(job.id, "job.created", { clientName, title, shootDate, callInDate, returnDate })
  revalidatePath("/studio")
  redirect(`/studio/jobs/${job.id}`)
}

/** FR-7: mint a link once, then re-use it so re-publishing keeps the same URL. */
export async function publishJob(jobId: string): Promise<ActionResult> {
  const stylist = await requireStylist()
  const [job] = await db()
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.userId, stylist.id)))
    .limit(1)
  if (!job) return { ok: false, error: "Job not found." }

  const existing = job.publicToken
  const { token, hash } = existing ? { token: existing, hash: sha256(existing) } : mintClientLink(jobId)

  await db()
    .update(jobs)
    .set({
      publicToken: token,
      publicTokenHash: hash,
      publishedAt: job.publishedAt ?? new Date(),
      status: job.status === "draft" ? "published" : job.status,
    })
    .where(eq(jobs.id, jobId))

  await recordHuman(jobId, existing ? "job.republished" : "job.published", { links: 1 })
  revalidatePath(`/studio/jobs/${jobId}`)
  return { ok: true, detail: publicBoardPath(token) }
}

/** FR-6: editing a look updates the board immediately, and the edit persists. */
export async function updateLook(input: {
  lookId: string
  lookNo?: number
  brand?: string
  season?: string | null
}): Promise<ActionResult> {
  const stylist = await requireStylist()
  const [look] = await db().select().from(looks).where(eq(looks.id, input.lookId)).limit(1)
  if (!look) return { ok: false, error: "Look not found." }
  const [job] = await db()
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, look.jobId), eq(jobs.userId, stylist.id)))
    .limit(1)
  if (!job) return { ok: false, error: "Look not found." }

  const patch: Partial<typeof looks.$inferInsert> = {}
  if (typeof input.lookNo === "number") {
    if (!Number.isInteger(input.lookNo) || input.lookNo < 0 || input.lookNo > 999) {
      return { ok: false, error: "Look number must be 0–999." }
    }
    patch.lookNo = input.lookNo
  }
  if (typeof input.brand === "string") {
    const brand = input.brand.trim()
    if (!brand) return { ok: false, error: "Brand cannot be empty." }
    patch.brand = brand
  }
  if (input.season !== undefined) patch.season = input.season?.trim() || null
  if (Object.keys(patch).length === 0) return { ok: true }

  // A manual correction is a different provenance than a machine read — say so in the trace.
  patch.readSource = "manual"
  await db().update(looks).set(patch).where(eq(looks.id, input.lookId))
  await recordHuman(look.jobId, "look.edited", { lookId: input.lookId, ...patch })
  revalidatePath(`/studio/jobs/${look.jobId}`)
  revalidatePath(`/studio/jobs/${look.jobId}/requests`)
  return { ok: true }
}

/** FR-6: hidden until publish, recoverable before it. */
export async function setLookHidden(lookId: string, hidden: boolean): Promise<ActionResult> {
  const stylist = await requireStylist()
  const [look] = await db().select().from(looks).where(eq(looks.id, lookId)).limit(1)
  if (!look) return { ok: false, error: "Look not found." }
  const [job] = await db()
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, look.jobId), eq(jobs.userId, stylist.id)))
    .limit(1)
  if (!job) return { ok: false, error: "Look not found." }

  await db()
    .update(looks)
    .set({ hiddenAt: hidden ? new Date() : null })
    .where(eq(looks.id, lookId))
  await recordHuman(look.jobId, hidden ? "look.hidden" : "look.restored", { lookId })
  revalidatePath(`/studio/jobs/${look.jobId}`)
  return { ok: true }
}

/** FR-8: one click sends the published link through Resend and records the email. */
export async function sendClientLink(jobId: string, to: string): Promise<ActionResult> {
  const stylist = await requireStylist()
  const address = to.trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return { ok: false, error: "That is not an email address." }

  const [job] = await db()
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.userId, stylist.id)))
    .limit(1)
  if (!job) return { ok: false, error: "Job not found." }
  if (!job.publicToken) return { ok: false, error: "Publish the board before sending the link." }

  const url = publicBoardPath(job.publicToken)
  const subject = `${job.clientName} — your looks are ready`
  const body = [
    `Hi ${job.clientName.split(" ")[0]},`,
    "",
    `${job.title} is ready for you: approve, pass or star the looks you want.`,
    "",
    url,
    "",
    "The link needs no account.",
    "",
    "Pull",
  ].join("\n")

  const html = `
    <div style="font-family:Inter,system-ui,sans-serif;max-width:520px">
      <p style="font-family:ui-monospace,monospace;font-size:11px;letter-spacing:.04em;color:#6b6a66">Pull.</p>
      <h1 style="font-size:22px;letter-spacing:-.02em">${job.title}</h1>
      <p style="color:#2c2c2b">Hi ${job.clientName.split(" ")[0]}, your looks are ready. Approve, pass or star what matters.</p>
      <p><a href="${url}" style="display:inline-block;background:#0a0a0a;color:#f9f9f8;padding:12px 20px;border-radius:999px;text-decoration:none">Open your board</a></p>
      <p style="color:#8f8b85;font-size:12px">No account needed. The link expires in 30 days.</p>
    </div>`

  const [row] = await db()
    .insert(emails)
    .values({ jobId, toEmail: address, subject, body, status: "queued" })
    .returning()

  try {
    const sent = await sendTraced(jobId, address, subject, html, body)
    await db()
      .update(emails)
      .set({ resendId: sent?.id ?? null, status: "sent", sentAt: new Date(), lastEventAt: new Date() })
      .where(eq(emails.id, row.id))
    if (job.status === "published") {
      await db().update(jobs).set({ status: "published" }).where(eq(jobs.id, jobId))
    }
    revalidatePath(`/studio/jobs/${jobId}`)
    return { ok: true, detail: `sent to ${address}` }
  } catch (error) {
    await db().update(emails).set({ status: "bounced" }).where(eq(emails.id, row.id))
    return { ok: false, error: error instanceof Error ? error.message : "Resend rejected the email." }
  }
}

async function sendTraced(jobId: string, to: string, subject: string, html: string, text: string) {
  const result = await sendEmail({ to, subject, html, text })
  // sendEmail is not traced by itself; the trace is what makes the send auditable.
  await recordSteps([
    {
      jobId,
      tool: "resend.send",
      status: "ok",
      args: { to, subject },
      result: { id: result.id },
    },
  ])
  return result
}


/**
 * Form wrappers. A server action bound to a <form action> renders a hidden action id, which means
 * these two work with JavaScript disabled and can be exercised with curl — the browser-only route
 * (onClick -> transition) has neither property. Both redirect back to the job page with the outcome
 * encoded in the query string, which the page renders as a banner.
 */
export async function publishJobForm(form: FormData): Promise<void> {
  const jobId = String(form.get("jobId") ?? "")
  const result = await publishJob(jobId)
  revalidatePath(`/studio/jobs/${jobId}`)
  const query = result.ok ? "published=1" : `error=${encodeURIComponent(result.error ?? "Could not publish.")}`
  redirect(`/studio/jobs/${jobId}?${query}`)
}

export async function sendClientLinkForm(form: FormData): Promise<void> {
  const jobId = String(form.get("jobId") ?? "")
  const to = String(form.get("to") ?? "")
  const result = await sendClientLink(jobId, to)
  revalidatePath(`/studio/jobs/${jobId}`)
  const query = result.ok
    ? `mailed=${encodeURIComponent(to)}`
    : `error=${encodeURIComponent(result.error ?? "Could not send the link.")}`
  redirect(`/studio/jobs/${jobId}?${query}`)
}

/** FR-6 as a form action: hide or restore a look, then back to the job with the outcome. */
export async function setLookHiddenForm(form: FormData): Promise<void> {
  const lookId = String(form.get("lookId") ?? "")
  const jobId = String(form.get("jobId") ?? "")
  const hidden = String(form.get("hidden") ?? "") === "true"
  const result = await setLookHidden(lookId, hidden)
  revalidatePath(`/studio/jobs/${jobId}`)
  const query = result.ok ? `${hidden ? "hidden" : "restored"}=1` : `error=${encodeURIComponent(result.error ?? "Could not update the look.")}`
  redirect(`/studio/jobs/${jobId}?${query}`)
}

/**
 * FR-11: submitting locks the review; further client edits require the stylist to reopen it.
 * Clearing reviewSubmittedAt means the next submission stamps once again — the earlier submission
 * time stays in the events log rather than being silently overwritten.
 */
export async function reopenReviewForm(form: FormData): Promise<void> {
  const jobId = String(form.get("jobId") ?? "")
  const stylist = await requireStylist()
  const [job] = await db()
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.userId, stylist.id)))
    .limit(1)
  if (!job) redirect(`/studio/jobs/${jobId}?error=${encodeURIComponent("Job not found.")}`)
  await db().update(jobs).set({ status: "published", reviewSubmittedAt: null }).where(eq(jobs.id, jobId))
  await recordHuman(jobId, "review.reopened", {})
  revalidatePath(`/studio/jobs/${jobId}`)
  redirect(`/studio/jobs/${jobId}?reopened=1`)
}

/**
 * Start a job — the four fields the stylist actually types: job name, client, client contact
 * email, job date. The schema's call-in/return dates are kept equal to the job date so nothing
 * downstream has to care that they were not asked for.
 */
export async function createSimpleJob(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const stylist = await requireStylist()
  const title = String(form.get("title") ?? "").trim()
  const clientName = String(form.get("clientName") ?? "").trim()
  const clientEmail = String(form.get("clientEmail") ?? "").trim()
  const jobDate = String(form.get("jobDate") ?? "")

  if (!title) return { ok: false, error: "Job name is required." }
  if (!clientName) return { ok: false, error: "Client is required." }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail)) return { ok: false, error: "Enter a valid contact email." }
  if (!isIsoDate(jobDate)) return { ok: false, error: "Pick a job date." }

  const [job] = await db()
    .insert(jobs)
    .values({
      userId: stylist.id,
      clientName,
      clientEmail,
      title,
      shootDate: jobDate,
      callInDate: jobDate,
      returnDate: jobDate,
      status: "draft",
    })
    .returning()

  await recordHuman(job.id, "job.created", { title, clientName, clientEmail, jobDate })
  revalidatePath("/studio")
  redirect(`/studio/jobs/${job.id}`)
}
