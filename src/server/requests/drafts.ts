/**
 * Drafting the request emails (FR-13). One draft per brand that has approved looks, created from the
 * client's report.
 *
 * Idempotent *and* re-entrant: it runs automatically when the client submits, the stylist can press
 * "Draft requests" by hand, and it runs again after a reopen. The rule that makes a second run safe:
 *
 *   - a brand whose request was already SENT is never touched — you cannot unsend an email;
 *   - a brand whose request is still a draft is replaced, so looks approved after a reopen actually
 *     reach the new draft instead of silently being dropped (found by client-board in M2 review);
 *   - an unsent draft for a brand that no longer has approved looks is removed.
 *
 * The deterministic template is used here because FR-13 requires drafts within 10 s of submission
 * and an LLM round-trip is not bounded. Wording polish is a per-draft human action (polishDraftForm).
 */
import { and, eq } from "drizzle-orm"
import { db } from "@/db/client"
import { contacts, emails, jobs, looks, requests, users } from "@/db/schema"
import { mintIntakeLink } from "@/lib/auth"
import { publicIntakePath } from "@/lib/share"
import { recordHuman, recordSteps, type StepInput } from "@/lib/agent/tracer"
import { deterministicDraft } from "@/lib/agent/request-email"
import { brandKey } from "@/lib/brand"

export interface DraftResult {
  created: number
  refreshed: number
  kept: number
  brands: { brand: string; requestId: string; emailId: string; looks: number }[]
  skipped: boolean
}

const UNSENT = "draft"

export async function ensureDrafts(jobId: string): Promise<DraftResult> {
  const [job] = await db().select().from(jobs).where(eq(jobs.id, jobId)).limit(1)
  if (!job) return { created: 0, refreshed: 0, kept: 0, brands: [], skipped: true }

  const [stylist] = await db().select().from(users).where(eq(users.id, job.userId)).limit(1)
  const approved = (
    await db().select().from(looks).where(and(eq(looks.jobId, jobId), eq(looks.status, "approved")))
  ).filter((look) => look.hiddenAt === null)

  const byBrand = new Map<string, typeof approved>()
  for (const look of approved) {
    const list = byBrand.get(look.brand) ?? []
    list.push(look)
    byBrand.set(look.brand, list)
  }

  const existing = await db().select().from(requests).where(eq(requests.jobId, jobId))
  const steps: StepInput[] = []
  const created: DraftResult["brands"] = []
  let createdCount = 0
  let refreshed = 0
  let kept = 0

  // Drop unsent drafts for brands the client no longer approves anything from.
  for (const request of existing) {
    if (request.status !== UNSENT) continue
    if (byBrand.has(request.brand)) continue
    await db().delete(emails).where(eq(emails.requestId, request.id))
    await db().delete(requests).where(eq(requests.id, request.id))
    steps.push({
      jobId,
      tool: "agent.draft",
      status: "ok",
      args: { brand: request.brand, action: "removed-unsent-draft", reason: "no approved looks left" },
      result: { requestId: request.id },
      durationMs: 0,
      at: new Date(),
    })
  }


  // Compare case-insensitively: "Celine" from OCR and "CELINE" from contacts are the same house.
  const contactRows = await db().select().from(contacts).where(eq(contacts.userId, job.userId))
  const contactsByBrand = new Map(contactRows.map((row) => [brandKey(row.brand), row]))

  for (const [brand, brandLooks] of byBrand.entries()) {
    const prior = existing.find((row) => brandKey(row.brand) === brandKey(brand))

    // A sent request is history: rewriting it would claim an email that already went out.
    if (prior && prior.status !== UNSENT) {
      kept += 1
      continue
    }

    const brandStart = Date.now()
    if (prior) {
      await db().delete(emails).where(eq(emails.requestId, prior.id))
      await db().delete(requests).where(eq(requests.id, prior.id))
    }

    const contact = contactsByBrand.get(brandKey(brand)) ?? null
    // Keep the contact's casing on the request so the studio list and the contacts table agree.
    const requestBrand = contact?.brand ?? brand
    const shipsOnOwnAccount = contact?.shipsOnOwnAccount ?? false
    const shippingMode = contact ? (shipsOnOwnAccount ? "showroom_ships" : "needs_label") : "unknown"

    const [request] = await db()
      .insert(requests)
      .values({ jobId, brand: requestBrand, status: "draft", shippingMode, contactId: contact?.id ?? null })
      .returning()

    let intakeToken: string | null = null
    if (shippingMode === "needs_label") {
      const intake = mintIntakeLink(request.id)
      intakeToken = intake.token
      await db()
        .update(requests)
        .set({ intakeToken: intake.token, intakeTokenHash: intake.hash })
        .where(eq(requests.id, request.id))
    }

    const draft = deterministicDraft({
      job: {
        clientName: job.clientName,
        title: job.title,
        shootDate: job.shootDate,
        callInDate: job.callInDate,
        returnDate: job.returnDate,
      },
      brand,
      looks: brandLooks.map((look) => ({ lookNo: look.lookNo, season: look.season })),
      contact: contact ? { emails: contact.emails ?? [], shipsOnOwnAccount } : null,
      studioAddress: stylist?.studioAddress ?? null,
      intakeUrl: intakeToken ? publicIntakePath(intakeToken) : undefined,
    })

    const [email] = await db()
      .insert(emails)
      .values({
        jobId,
        requestId: request.id,
        toEmail: contact?.emails?.[0] ?? "",
        subject: draft.subject,
        body: draft.body,
        status: "draft",
      })
      .returning()

    steps.push({
      jobId,
      tool: "agent.draft",
      status: "ok",
      args: {
        brand: requestBrand,
        looks: brandLooks.map((look) => look.lookNo),
        shippingMode,
        contactResolved: Boolean(contact?.emails?.length),
        provider: "deterministic",
        action: prior ? "refreshed" : "created",
      },
      result: { requestId: request.id, emailId: email.id, subject: draft.subject },
      durationMs: Date.now() - brandStart,
      at: new Date(brandStart),
    })

    created.push({ brand: requestBrand, requestId: request.id, emailId: email.id, looks: brandLooks.length })
    if (prior) refreshed += 1
    else createdCount += 1
  }

  await recordSteps(steps)
  await recordHuman(jobId, "requests.drafted", {
    created: createdCount,
    refreshed,
    kept,
    looks: approved.length,
  })

  if (createdCount + refreshed > 0 && (job.status === "client_reviewed" || job.status === "published")) {
    await db().update(jobs).set({ status: "requests_drafted" }).where(eq(jobs.id, jobId))
  }

  return {
    created: createdCount,
    refreshed,
    kept,
    brands: created,
    skipped: createdCount + refreshed === 0 && steps.length === 0,
  }
}
