/**
 * Act 2 request emails: draft -> edit -> approve -> send (FR-13, FR-14).
 *
 * Every mutation re-reads the email, its job, and the job's owner — the studio is behind a session,
 * but the ids still come from the browser. Nothing is sent unless the stylist approved the draft
 * (status `queued`) and the contact resolved to a real address (FR-15: never send to a guess).
 */
"use server"

import { and, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { db } from "@/db/client"
import { contacts, emails, jobs, looks, requests, users } from "@/db/schema"
import { requireStylist } from "@/lib/auth"
import { recordHuman, recordSteps } from "@/lib/agent/tracer"
import { sendEmail } from "@/lib/resend"
import { draftRequestEmail } from "@/lib/agent/request-email"
import { sameBrand } from "@/lib/brand"
import { ensureDrafts } from "@/server/requests/drafts"

async function ownedEmail(stylistId: string, emailId: string) {
  const [row] = await db().select().from(emails).where(eq(emails.id, emailId)).limit(1)
  if (!row) return null
  const [job] = await db()
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, row.jobId), eq(jobs.userId, stylistId)))
    .limit(1)
  return job ? { email: row, job } : null
}

function back(jobId: string, query = ""): never {
  revalidatePath(`/studio/jobs/${jobId}/requests`)
  revalidatePath(`/studio/jobs/${jobId}`)
  redirect(`/studio/jobs/${jobId}/requests${query}`)
}

function fail(jobId: string, message: string): never {
  back(jobId, `?error=${encodeURIComponent(message)}`)
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/** Draft now: idempotent, so pressing it twice cannot duplicate requests. */
export async function draftNowForm(form: FormData): Promise<void> {
  const stylist = await requireStylist()
  const jobId = String(form.get("jobId") ?? "")
  const [job] = await db()
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.userId, stylist.id)))
    .limit(1)
  if (!job) fail(jobId, "Job not found.")
  const result = await ensureDrafts(jobId)
  const written = result.created + result.refreshed
  back(jobId, result.skipped ? "?note=Nothing%20to%20draft." : `?drafted=${written}`)
}

export async function saveDraftForm(form: FormData): Promise<void> {
  const stylist = await requireStylist()
  const emailId = String(form.get("emailId") ?? "")
  const owned = await ownedEmail(stylist.id, emailId)
  if (!owned) redirect("/studio")
  if (owned.email.status === "sent") fail(owned.job.id, "This email has already been sent.")

  const subject = String(form.get("subject") ?? "").trim()
  const body = String(form.get("body") ?? "").trim()
  if (!subject || !body) fail(owned.job.id, "Subject and body are required.")

  await db().update(emails).set({ subject, body }).where(eq(emails.id, emailId))
  await recordHuman(owned.job.id, "email.edited", { emailId })
  back(owned.job.id, "?saved=1")
}

/** Approval is a separate state on purpose: editing an approved draft is fine, sending is not implied. */
export async function approveDraftForm(form: FormData): Promise<void> {
  const stylist = await requireStylist()
  const emailId = String(form.get("emailId") ?? "")
  const owned = await ownedEmail(stylist.id, emailId)
  if (!owned) redirect("/studio")
  if (!owned.email.toEmail) fail(owned.job.id, "Contact missing — resolve it before approving.")
  if (owned.email.status === "sent") fail(owned.job.id, "This email has already been sent.")

  await db().update(emails).set({ status: "queued" }).where(eq(emails.id, emailId))
  await recordHuman(owned.job.id, "email.approved", { emailId })
  back(owned.job.id, "?approved=1")
}

export async function sendDraftForm(form: FormData): Promise<void> {
  const stylist = await requireStylist()
  const emailId = String(form.get("emailId") ?? "")
  const owned = await ownedEmail(stylist.id, emailId)
  if (!owned) redirect("/studio")
  const outcome = await sendOne(owned.job.id, emailId)
  if (!outcome.ok) fail(owned.job.id, outcome.error ?? "Send failed.")
  back(owned.job.id, "?sent=1")
}

export async function sendAllApprovedForm(form: FormData): Promise<void> {
  const stylist = await requireStylist()
  const jobId = String(form.get("jobId") ?? "")
  const [job] = await db()
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.userId, stylist.id)))
    .limit(1)
  if (!job) redirect("/studio")

  const queued = await db()
    .select()
    .from(emails)
    .where(and(eq(emails.jobId, jobId), eq(emails.status, "queued")))
  if (queued.length === 0) back(jobId, "?note=No%20approved%20drafts%20to%20send.")

  let sent = 0
  for (const row of queued) {
    const outcome = await sendOne(jobId, row.id)
    if (!outcome.ok) fail(jobId, outcome.error ?? "Send failed.")
    sent += 1
  }
  back(jobId, `?sent=${sent}`)
}

async function sendOne(jobId: string, emailId: string): Promise<{ ok: boolean; error?: string }> {
  const [row] = await db().select().from(emails).where(eq(emails.id, emailId)).limit(1)
  if (!row) return { ok: false, error: "Draft not found." }
  if (row.status === "sent") return { ok: false, error: "Already sent." }
  if (row.status !== "queued") return { ok: false, error: "Approve the draft before sending it." }
  if (!row.toEmail) return { ok: false, error: "Contact missing — nothing was sent." }

  const started = Date.now()
  try {
    const sent = await sendEmail({
      to: row.toEmail,
      subject: row.subject,
      text: row.body,
      html: `<div style="font-family:Inter,system-ui,sans-serif;max-width:600px;white-space:pre-wrap;color:#2c2c2b">${escapeHtml(row.body)}</div>`,
    })
    await db()
      .update(emails)
      .set({ status: "sent", resendId: sent.id, sentAt: new Date(), lastEventAt: new Date() })
      .where(eq(emails.id, emailId))
    if (row.requestId) {
      await db().update(requests).set({ status: "sent" }).where(eq(requests.id, row.requestId))
    }
    await recordSteps([
      {
        jobId,
        tool: "resend.send",
        status: "ok",
        args: { to: row.toEmail, subject: row.subject },
        result: { id: sent.id },
        durationMs: Date.now() - started,
      },
    ])
    await recordHuman(jobId, "request.sent", { emailId, to: row.toEmail })
    await promoteJobStatus(jobId)
    return { ok: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Resend rejected the email."
    // A failed send leaves the draft approved, so the stylist can retry without re-approving.
    await recordSteps([
      {
        jobId,
        tool: "resend.send",
        status: "error",
        args: { to: row.toEmail, subject: row.subject },
        error: message,
        durationMs: Date.now() - started,
      },
    ])
    return { ok: false, error: message }
  }
}

/** A job becomes `requests_sent` only when every drafted request has actually gone out. */
async function promoteJobStatus(jobId: string): Promise<void> {
  const rows = await db().select().from(requests).where(eq(requests.jobId, jobId))
  if (rows.length === 0) return
  if (rows.every((row) => row.status === "sent")) {
    await db().update(jobs).set({ status: "requests_sent" }).where(eq(jobs.id, jobId))
  }
}

/** Optional AI polish of one draft (FR-24). Any approved look missing from the result is rejected. */
export async function polishDraftForm(form: FormData): Promise<void> {
  const stylist = await requireStylist()
  const emailId = String(form.get("emailId") ?? "")
  const owned = await ownedEmail(stylist.id, emailId)
  if (!owned) redirect("/studio")
  const { job, email } = owned
  if (email.status === "sent") fail(job.id, "This email has already been sent.")

  const [request] = email.requestId
    ? await db().select().from(requests).where(eq(requests.id, email.requestId)).limit(1)
    : []
  if (!request) fail(job.id, "This draft is not linked to a request.")

  const approvedLooks = (
    await db().select().from(looks).where(and(eq(looks.jobId, job.id), eq(looks.status, "approved")))
  ).filter((look) => sameBrand(look.brand, request.brand) && look.hiddenAt === null)
  if (approvedLooks.length === 0) fail(job.id, "No approved looks for this brand.")

  const [stylistRow] = await db().select().from(users).where(eq(users.id, stylist.id)).limit(1)
  const stylistContacts = await db().select().from(contacts).where(eq(contacts.userId, stylist.id))
  const contact = stylistContacts.find((row) => sameBrand(row.brand, request.brand))

  const draft = await draftRequestEmail(
    {
      job: {
        clientName: job.clientName,
        title: job.title,
        shootDate: job.shootDate,
        callInDate: job.callInDate,
        returnDate: job.returnDate,
      },
      brand: request.brand,
      looks: approvedLooks.map((look) => ({ lookNo: look.lookNo, season: look.season })),
      contact: contact ? { emails: contact.emails ?? [], shipsOnOwnAccount: contact.shipsOnOwnAccount } : null,
      studioAddress: stylistRow?.studioAddress ?? null,
    },
    { jobId: job.id },
  )

  await db().update(emails).set({ subject: draft.subject, body: draft.body }).where(eq(emails.id, emailId))
  await recordHuman(job.id, "email.polished", { emailId, provider: draft.provider })
  back(job.id, `?polished=${draft.provider}`)
}
