/**
 * FR-22 — the job's activity log: everything the agent AND the humans did, in one chronological
 * list. The agent trace on the job page filters `actor = 'agent'`; this query keeps all three
 * actors so "job created", "board published", "client submitted", "rate chosen" are visible too.
 *
 * Rows are summaries, not JSON dumps: each handler reads what the code that wrote the event
 * actually put in `payload` (which is either a trace wrapper `{args, result, error, status}` or a
 * plain object from `recordHuman`), and falls back to something readable when a field is missing.
 * Unknown kinds return the raw kind — an event we do not understand is still shown, never dropped.
 */
import { desc, eq } from "drizzle-orm"
import { db } from "@/db/client"
import { events } from "@/db/schema"

export interface ActivityRow {
  id: string
  /** ISO timestamp. */
  at: string
  actor: string
  kind: string
  summary: string
  /** True when the recorded step failed; the summary already carries the verbatim error. */
  error: boolean
}

export interface ActivityCounts {
  total: number
  cropped: number
  readFromImage: number
  parsed: number
  emailsSent: number
  labelsBought: number
  failed: number
}

export interface ActivityResult {
  rows: ActivityRow[]
  counts: ActivityCounts
}

type Payload = Record<string, unknown>

function record(value: unknown): Payload | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Payload)
    : null
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function count(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.round(parsed) : null
}

function list(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null
}

function money(amount: number, currency: string): string {
  const code = (currency || "USD").toUpperCase()
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: code }).format(amount)
  } catch {
    return `${code} ${amount.toFixed(2)}`
  }
}

/** `2 approved, 1 passed` reads better than a JSON counts blob. */
function countPhrase(label: string, value: number | null): string {
  if (value === null) return ""
  return `${value} ${label}${value === 1 ? "" : "s"}`
}

function plural(value: number, singular: string): string {
  return `${value} ${singular}${value === 1 ? "" : "s"}`
}

function summarise(kind: string, rawPayload: unknown): { summary: string; error: boolean } {
  const payload = record(rawPayload) ?? {}
  const args = record(payload.args) ?? {}
  const result = record(payload.result) ?? {}
  const errorText = text(payload.error)
  const isError = payload.status === "error" || errorText.length > 0

  const failed = (label: string) => ({
    summary: `${label}: ${errorText || "unknown error"}`,
    error: true,
  })

  switch (kind) {
    case "cloudinary.upload": {
      if (isError) return failed("upload failed")
      const filename = text(args.filename) || text(result.public_id) || "a screenshot"
      return { summary: `uploaded ${filename}`, error: false }
    }
    case "cloudinary.trim": {
      if (isError) return failed("crop failed")
      return { summary: "cropped a look to the board tile (delivery transform)", error: false }
    }
    case "tesseract.read": {
      if (isError) return failed("OCR failed")
      const read = text(result.text)
      const confidence = count(result.confidence)
      const lookNo = /look\s*#?\s*(\d{1,3})/i.exec(read)?.[1]
      const subject = lookNo ? `read look ${lookNo}` : "read the screenshot caption"
      return {
        summary: `${subject}${confidence !== null ? ` · ${confidence}% confidence` : ""}`,
        error: false,
      }
    }
    case "agent.parse": {
      if (isError) return failed("parse failed")
      const lookNo = count(result.lookNo)
      const season = text(result.season)
      const brand = text(result.brand)
      const parts = [lookNo !== null ? `look ${lookNo}` : "a look", season, brand].filter(Boolean)
      return { summary: `parsed ${parts.join(" · ")}`, error: false }
    }
    case "agent.group": {
      if (isError) return failed("grouping failed")
      const looks =
        list(result.looks)?.length ?? count(result.looks) ?? count(record(result.counts)?.images) ?? count(args.images) ?? 0
      const boards = list(result.boards)?.length ?? count(result.boards) ?? 0
      return { summary: `grouped ${plural(looks, "look")} into ${plural(boards, "board")}`, error: false }
    }
    case "agent.draft": {
      if (isError) return failed("draft failed")
      const brand = text(args.brand)
      const looks = list(args.looks)?.length ?? 0
      return {
        summary: `drafted ${brand || "the"} request${looks ? ` (${plural(looks, "look")})` : ""}`,
        error: false,
      }
    }
    case "requests.drafted": {
      const created = count(payload.created)
      const brands = count(payload.brands)
      const looks = count(payload.looks)
      const kept = count(payload.kept)
      if (created !== null && created > 0) {
        return {
          summary: `drafted ${plural(created, "request")}${brands ? ` across ${plural(brands, "brand")}` : ""}`,
          error: false,
        }
      }
      if (kept !== null) {
        return {
          summary: `checked request drafts — ${plural(kept, "brand")} kept${looks ? `, ${plural(looks, "look")}` : ""}`,
          error: false,
        }
      }
      return {
        summary: `drafted requests for ${plural(brands ?? 0, "brand")}${looks ? ` (${plural(looks, "look")})` : ""}`,
        error: false,
      }
    }
    case "email.edited":
      return { summary: "edited a request draft", error: false }
    case "email.approved":
      return { summary: "approved a request draft", error: false }
    case "email.polished": {
      const provider = text(payload.provider)
      return { summary: `rewrote a draft${provider ? ` with ${provider}` : ""}`, error: false }
    }
    case "request.sent": {
      const to = text(payload.to)
      return { summary: `sent request email${to ? ` to ${to}` : ""}`, error: false }
    }
    case "resend.send": {
      if (isError) return failed("send failed")
      const to = text(args.to) || text(payload.to)
      const attachment = text(args.attachment)
      return {
        summary: `sent email${to ? ` to ${to}` : ""}${attachment ? ` with ${attachment}` : ""}`,
        error: false,
      }
    }
    case "shippo.rates": {
      if (isError) return failed("rate quote failed")
      const rates = list(result.rates)?.map(record).filter((rate): rate is Payload => Boolean(rate)) ?? []
      if (rates.length === 0) return { summary: "no rates quoted for this lane", error: false }
      const cheapest = [...rates].sort((a, b) => (Number(a.amount) || 0) - (Number(b.amount) || 0))[0]
      const amount = Number(cheapest.amount)
      return {
        summary: `quoted ${plural(rates.length, "rate")}, cheapest ${
          Number.isFinite(amount) ? money(amount, text(cheapest.currency)) : "—"
        }`,
        error: false,
      }
    }
    case "shippo.label": {
      if (isError) return failed("label purchase failed")
      const tracking = text(result.tracking) || text(payload.tracking)
      return { summary: `bought label${tracking ? ` · tracking ${tracking}` : ""}`, error: false }
    }
    case "label.rate_chosen": {
      const carrier = text(payload.carrier)
      const service = text(payload.service)
      const amount = Number(payload.amount)
      const currency = text(payload.currency)
      const price = Number.isFinite(amount) ? money(amount, currency) : ""
      return {
        summary: `chose ${[carrier, service].filter(Boolean).join(" ") || "a rate"}${price ? ` — ${price}` : ""}`,
        error: false,
      }
    }
    case "label.bought": {
      const tracking = text(payload.tracking)
      return { summary: `bought label${tracking ? ` · tracking ${tracking}` : ""}`, error: false }
    }
    case "label.sent": {
      const to = text(payload.to)
      return { summary: `emailed the label${to ? ` to ${to}` : ""}`, error: false }
    }
    case "job.created": {
      const clientName = text(payload.clientName)
      return { summary: `job created${clientName ? ` for ${clientName}` : ""}`, error: false }
    }
    case "job.published":
      return { summary: "board published", error: false }
    case "job.republished":
      return { summary: "board republished", error: false }
    case "look.hidden":
      return { summary: "hid a look", error: false }
    case "look.restored":
      return { summary: "restored a hidden look", error: false }
    case "look.edited":
      return { summary: "edited a look", error: false }
    case "review.submitted": {
      const counts = record(payload.counts)
      const phrase = [
        countPhrase("approved", count(counts?.approved)),
        countPhrase("passed", count(counts?.passed)),
        countPhrase("must-have", count(counts?.mustHaves)),
      ]
        .filter(Boolean)
        .join(", ")
      return {
        summary: `client submitted${phrase ? `: ${phrase}` : ""}`,
        error: false,
      }
    }
    case "review.reopened":
      return { summary: "review reopened", error: false }
    case "contact.missing": {
      const brand = text(payload.brand)
      return { summary: `contact missing${brand ? ` for ${brand}` : ""}`, error: false }
    }
    case "shippo.track": {
      if (isError) return failed("tracking refresh failed")
      const status = text(payload.status) || text(result.status) || "updated"
      return { summary: `refreshed tracking — ${status.replace(/_/g, " ")}`, error: false }
    }
    case "deepseek.run":
      return { summary: "drafted with deepseek", error: false }
    case "zoowork.run":
      return { summary: "drafted with zoowork", error: false }
    default:
      // Unknown kinds are still events: show them raw rather than dropping the audit trail.
      return isError
        ? { summary: `${kind} failed: ${errorText || "unknown error"}`, error: true }
        : { summary: kind, error: false }
  }
}

export async function getActivity(jobId: string, limit = 120): Promise<ActivityResult> {
  if (!jobId) return { rows: [], counts: emptyCounts() }
  const rows = await db()
    .select()
    .from(events)
    .where(eq(events.jobId, jobId))
    .orderBy(desc(events.createdAt), desc(events.id))
    .limit(limit)

  const mapped: ActivityRow[] = rows.map((row) => {
    const { summary, error } = summarise(row.kind, row.payload)
    return {
      id: String(row.id),
      at: row.createdAt.toISOString(),
      actor: row.actor,
      kind: row.kind,
      summary,
      error,
    }
  })

  const counts = emptyCounts()
  counts.total = mapped.length
  for (const row of rows) {
    const payload = record(row.payload) ?? {}
    const ok = payload.status !== "error" && !text(payload.error)
    if (payload.status === "error" || text(payload.error)) counts.failed += 1
    if (!ok) continue
    if (row.kind === "cloudinary.trim") counts.cropped += 1
    else if (row.kind === "tesseract.read") counts.readFromImage += 1
    else if (row.kind === "agent.parse") counts.parsed += 1
    else if (row.kind === "resend.send") counts.emailsSent += 1
    else if (row.kind === "shippo.label") counts.labelsBought += 1
  }

  return { rows: mapped, counts }
}

function emptyCounts(): ActivityCounts {
  return {
    total: 0,
    cropped: 0,
    readFromImage: 0,
    parsed: 0,
    emailsSent: 0,
    labelsBought: 0,
    failed: 0,
  }
}
