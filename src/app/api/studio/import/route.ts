/**
 * Act 1, steps 3–5 — persist one import batch (PRD §7 table, FR-4, FR-5, FR-23).
 *
 * The browser has already uploaded to Cloudinary, OCR'd and parsed. It POSTs the whole batch here
 * with each step's measured duration and original start time. This route:
 *   1. verifies the session (JSON 401) and re-reads the job by `userId` (404 otherwise) — a client
 *      jobId is never trusted,
 *   2. records the browser steps through `recordSteps()` with their `at` times, including failures,
 *   3. groups looks into one board per brand ("Unassigned" fallback) inside a traced `agent.group`
 *      step, ordered by look number, and inserts the looks.
 *
 * `importId` makes a retried batch idempotent: the first `agent.group` event carries it in its
 * args, and a repeat with the same id replays the stored result instead of duplicating rows.
 */
import { and, asc, desc, eq, sql } from "drizzle-orm"
import { NextResponse } from "next/server"
import { db } from "@/db/client"
import { boards, events, jobs, looks } from "@/db/schema"
import { canonicalBrand } from "@/lib/agent/parse"
import { recordSteps, withTrace, type StepInput } from "@/lib/agent/tracer"
import { getStylist } from "@/lib/auth"
import { boardImageUrl } from "@/lib/cloudinary"
import type {
  ImportBatchCounts,
  ImportBatchResult,
  ImportedBoard,
  ImportedLook,
  ImportStepName,
} from "@/components/import/types"

export const runtime = "nodejs"

const MAX_IMAGES = 40
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const READ_SOURCES = new Set(["image", "filename", "sequence"] as const)
const STEP_NAMES = ["upload", "trim", "ocr", "parse"] as const
type StepName = (typeof STEP_NAMES)[number]
const FAILURE_TOOLS = new Set(["cloudinary.upload", "cloudinary.trim", "tesseract.read", "agent.parse"])
/** The Cloudinary delivery transform that crops to the board tile — recorded, not requested. */
const BOARD_TRANSFORM = "e_trim:20,c_fill,w_1200,h_1600,g_auto,q_auto,f_auto"

interface CleanStep {
  status: "ok" | "error"
  durationMs: number
  error?: string
}

interface CleanImage {
  filename: string
  sourcePublicId: string
  imagePublicId: string
  secureUrl: string
  width: number
  height: number
  lookNo: number
  season: string | null
  brand: string
  confidence: number
  readSource: "image" | "filename" | "sequence"
  ocrText: string
  ocrConfidence: number
  steps: Record<StepName, CleanStep>
  ats: Partial<Record<ImportStepName, string>>
}

interface CleanFailure {
  filename: string
  tool: string
  error: string
  durationMs: number
  at?: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}

function integer(value: unknown, min: number, max: number, fallback = 0): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.round(parsed)))
}

function decimal(value: unknown, min: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return min
  return Math.min(max, Math.max(min, parsed))
}

function cleanStep(value: unknown): CleanStep {
  const record = asRecord(value)
  const status = record?.status === "error" ? "error" : "ok"
  const durationMs = integer(record?.durationMs, 0, 10 * 60 * 1000)
  const error = text(record?.error, 1000)
  return { status, durationMs, ...(status === "error" && error ? { error } : {}) }
}

function cleanAts(value: unknown): Partial<Record<ImportStepName, string>> {
  const record = asRecord(value)
  const ats: Partial<Record<ImportStepName, string>> = {}
  if (!record) return ats
  for (const name of STEP_NAMES) {
    const iso = text(record[name], 40)
    if (!iso) continue
    const time = Date.parse(iso)
    if (Number.isFinite(time) && time > 0) ats[name] = new Date(time).toISOString()
  }
  return ats
}

function atDate(iso: string | undefined): Date | undefined {
  if (!iso) return undefined
  const time = Date.parse(iso)
  return Number.isFinite(time) ? new Date(time) : undefined
}

function imageUrlFor(publicId: string, fallback: string): string {
  try {
    return boardImageUrl(publicId, 600)
  } catch {
    return fallback
  }
}

function emptyResult(jobId: string, importId: string | null): ImportBatchResult {
  return {
    ok: true,
    jobId,
    importId: importId ?? undefined,
    boards: [],
    looks: [],
    counts: {
      images: 0,
      boards: 0,
      readFromImage: 0,
      readFromFilename: 0,
      readFromSequence: 0,
    },
  }
}

/** Write browser-measured steps into the trace, in the order the browser ran them. */
function traceBrowserSteps(jobId: string, images: CleanImage[], failures: CleanFailure[]): StepInput[] {
  const trace: StepInput[] = []
  for (const image of images) {
    trace.push({
      jobId,
      tool: "cloudinary.upload",
      status: image.steps.upload.status,
      args: { filename: image.filename, folder: `pull/jobs/${jobId}` },
      result:
        image.steps.upload.status === "ok"
          ? {
              public_id: image.sourcePublicId,
              secure_url: image.secureUrl,
              width: image.width,
              height: image.height,
            }
          : undefined,
      error: image.steps.upload.error,
      durationMs: image.steps.upload.durationMs,
      at: atDate(image.ats.upload),
    })
    trace.push({
      jobId,
      tool: "cloudinary.trim",
      status: image.steps.trim.status,
      // The crop is a delivery transform; the trace must not claim a network call that did not happen.
      args: { public_id: image.sourcePublicId, effect: "trim:20", mode: "delivery-transform" },
      result:
        image.steps.trim.status === "ok"
          ? { transformation: BOARD_TRANSFORM, width: 1200, height: 1600, mode: "delivery-transform" }
          : undefined,
      error: image.steps.trim.error,
      durationMs: image.steps.trim.durationMs,
      at: atDate(image.ats.trim),
    })
    trace.push({
      jobId,
      tool: "tesseract.read",
      status: image.steps.ocr.status,
      args: { filename: image.filename },
      result:
        image.steps.ocr.status === "ok"
          ? { text: image.ocrText.slice(0, 500), confidence: image.ocrConfidence }
          : undefined,
      error: image.steps.ocr.error,
      durationMs: image.steps.ocr.durationMs,
      at: atDate(image.ats.ocr),
    })
    trace.push({
      jobId,
      tool: "agent.parse",
      status: image.steps.parse.status,
      args: { filename: image.filename },
      result:
        image.steps.parse.status === "ok"
          ? {
              lookNo: image.lookNo,
              season: image.season,
              brand: image.brand,
              confidence: image.confidence,
              readSource: image.readSource,
            }
          : undefined,
      error: image.steps.parse.error,
      durationMs: image.steps.parse.durationMs,
      at: atDate(image.ats.parse),
    })
  }
  for (const failure of failures) {
    trace.push({
      jobId,
      tool: failure.tool,
      status: "error",
      args: { filename: failure.filename },
      error: failure.error,
      durationMs: failure.durationMs,
      at: atDate(failure.at),
    })
  }
  return trace
}

/**
 * Find the `agent.group` event for this importId. Its stored result is the replay payload, so a
 * browser retry after a partial failure cannot duplicate boards or looks.
 */
async function findPreviousGroup(jobId: string, importId: string): Promise<ImportBatchResult | null> {
  const [event] = await db()
    .select({ payload: events.payload })
    .from(events)
    .where(
      and(
        eq(events.jobId, jobId),
        eq(events.kind, "agent.group"),
        sql`${events.payload}->'args'->>'importId' = ${importId}`,
      ),
    )
    .orderBy(desc(events.id))
    .limit(1)
  const payload = asRecord(event?.payload)
  const stored = asRecord(payload?.result)
  if (!stored) return null
  if (!Array.isArray(stored.boards) || !Array.isArray(stored.looks) || !asRecord(stored.counts)) return null
  return stored as unknown as ImportBatchResult
}

export async function POST(request: Request) {
  const stylist = await getStylist()
  if (!stylist) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  let body: Record<string, unknown> | null
  try {
    body = asRecord(await request.json())
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 })
  }
  if (!body) return NextResponse.json({ error: "invalid JSON body" }, { status: 400 })

  const jobId = text(body.jobId, 64)
  if (!UUID_RE.test(jobId)) {
    return NextResponse.json({ error: "jobId must be a job UUID" }, { status: 400 })
  }

  // Ownership is re-read from Neon; the jobId came from the browser.
  const [job] = await db()
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.userId, stylist.id)))
    .limit(1)
  if (!job) return NextResponse.json({ error: "job not found" }, { status: 404 })

  const importId = text(body.importId, 100) || null
  const rawImages = Array.isArray(body.images) ? body.images : null
  const rawFailures = Array.isArray(body.failures) ? body.failures : []
  if (!rawImages) return NextResponse.json({ error: "images must be an array" }, { status: 400 })
  if (rawImages.length > MAX_IMAGES) {
    return NextResponse.json({ error: `an import is at most ${MAX_IMAGES} images` }, { status: 400 })
  }
  if (rawFailures.length > MAX_IMAGES) {
    return NextResponse.json({ error: "too many failures reported" }, { status: 400 })
  }

  // Validate the browser's failures first — they are trace-only and never become rows.
  const failures: CleanFailure[] = []
  for (const [index, value] of rawFailures.entries()) {
    const record = asRecord(value)
    const tool = text(record?.tool, 40)
    if (!record || !FAILURE_TOOLS.has(tool)) {
      return NextResponse.json({ error: `failures[${index}].tool is not a traced import tool` }, { status: 400 })
    }
    const iso = text(record.at, 40)
    failures.push({
      filename: text(record.filename, 200) || `file ${index + 1}`,
      tool,
      error: text(record.error, 1000) || "unknown error",
      durationMs: integer(record.durationMs, 0, 10 * 60 * 1000),
      ...(iso && Number.isFinite(Date.parse(iso)) ? { at: new Date(iso).toISOString() } : {}),
    })
  }

  // An empty batch is a no-op, not an empty board.
  if (rawImages.length === 0) {
    await recordSteps(traceBrowserSteps(jobId, [], failures))
    return NextResponse.json(emptyResult(jobId, importId))
  }

  if (importId) {
    const previous = await findPreviousGroup(jobId, importId)
    if (previous) {
      return NextResponse.json({
        ...previous,
        ok: true,
        jobId,
        importId,
        alreadyImported: true,
      } satisfies ImportBatchResult)
    }
  }

  // Validate the browser's reads. The server is the authority on what reaches Postgres.
  const images: CleanImage[] = []
  for (const [index, value] of rawImages.entries()) {
    const record = asRecord(value)
    if (!record) {
      return NextResponse.json({ error: `images[${index}] must be an object` }, { status: 400 })
    }
    const filename = text(record.filename, 200) || `image-${index + 1}`
    const sourcePublicId = text(record.sourcePublicId, 300)
    if (!sourcePublicId) {
      return NextResponse.json({ error: `images[${index}].sourcePublicId is required` }, { status: 400 })
    }
    const lookNo = integer(record.lookNo, 0, 999, -1)
    if (lookNo < 0) {
      return NextResponse.json({ error: `images[${index}].lookNo must be 0–999` }, { status: 400 })
    }
    const readSource = text(record.readSource, 20)
    if (!READ_SOURCES.has(readSource as "image" | "filename" | "sequence")) {
      return NextResponse.json({ error: `images[${index}].readSource is invalid` }, { status: 400 })
    }
    const rawSteps = asRecord(record.steps)
    images.push({
      filename,
      sourcePublicId,
      imagePublicId: text(record.imagePublicId, 300) || sourcePublicId,
      secureUrl: text(record.secureUrl, 600),
      width: integer(record.width, 0, 20000),
      height: integer(record.height, 0, 20000),
      lookNo,
      season: record.season == null ? null : text(record.season, 16).toUpperCase() || null,
      brand: canonicalBrand(text(record.brand, 80) || "Unassigned"),
      confidence: Math.round(decimal(record.confidence, 0, 1) * 100) / 100,
      readSource: readSource as "image" | "filename" | "sequence",
      ocrText: typeof record.ocrText === "string" ? record.ocrText.slice(0, 4000) : "",
      ocrConfidence: Math.round(decimal(record.ocrConfidence, 0, 100)),
      steps: {
        upload: cleanStep(rawSteps?.upload),
        trim: cleanStep(rawSteps?.trim),
        ocr: cleanStep(rawSteps?.ocr),
        parse: cleanStep(rawSteps?.parse),
      },
      ats: cleanAts(rawSteps?.ats),
    })
  }

  // Browser steps first: upload → trim → OCR → parse per file, then failures.
  await recordSteps(traceBrowserSteps(jobId, images, failures))

  try {
    const grouped = await withTrace(
      {
        jobId,
        tool: "agent.group",
        args: {
          importId,
          images: images.length,
          brands: [...new Set(images.map((image) => image.brand))].sort(),
        },
      },
      async () => {
        const existingBoards = await db()
          .select({ id: boards.id, brand: boards.brand, position: boards.position })
          .from(boards)
          .where(eq(boards.jobId, jobId))
          .orderBy(asc(boards.position))
        const existingLooks = await db()
          .select({ boardId: looks.boardId, position: looks.position })
          .from(looks)
          .where(eq(looks.jobId, jobId))

        const boardByBrand = new Map<string, { id: string; brand: string; position: number }>()
        for (const board of existingBoards) boardByBrand.set(board.brand.toLowerCase(), board)
        const maxPositionByBoard = new Map<string, number>()
        for (const look of existingLooks) {
          maxPositionByBoard.set(look.boardId, Math.max(maxPositionByBoard.get(look.boardId) ?? -1, look.position))
        }
        let nextBoardPosition = existingBoards.reduce((highest, board) => Math.max(highest, board.position), -1) + 1

        // One board per brand (FR-5). Order brands by their lowest look number.
        const groups = new Map<string, { brand: string; images: CleanImage[] }>()
        for (const image of images) {
          const key = image.brand.toLowerCase()
          const group = groups.get(key) ?? { brand: image.brand, images: [] }
          group.images.push(image)
          groups.set(key, group)
        }
        const orderedGroups = [...groups.values()].sort((a, b) => {
          const lowestA = Math.min(...a.images.map((image) => image.lookNo))
          const lowestB = Math.min(...b.images.map((image) => image.lookNo))
          return lowestA - lowestB || a.brand.localeCompare(b.brand)
        })

        const boardSummary: ImportedBoard[] = []
        const lookValues: (typeof looks.$inferInsert)[] = []

        for (const group of orderedGroups) {
          const key = group.brand.toLowerCase()
          let board = boardByBrand.get(key)
          if (!board) {
            const [created] = await db()
              .insert(boards)
              .values({ jobId, brand: group.brand, position: nextBoardPosition })
              .returning({ id: boards.id, brand: boards.brand, position: boards.position })
            board = created
            boardByBrand.set(key, board)
            nextBoardPosition += 1
          }

          // Ordered by look number inside the board (FR-5 acceptance).
          const sorted = [...group.images].sort(
            (a, b) => a.lookNo - b.lookNo || a.filename.localeCompare(b.filename),
          )
          const basePosition = (maxPositionByBoard.get(board.id) ?? -1) + 1
          sorted.forEach((image, index) => {
            lookValues.push({
              jobId,
              boardId: board.id,
              sourcePublicId: image.sourcePublicId,
              imagePublicId: image.imagePublicId,
              lookNo: image.lookNo,
              season: image.season,
              brand: group.brand,
              confidence: image.confidence.toFixed(2),
              readSource: image.readSource,
              ocrText: image.ocrText,
              status: "draft",
              position: basePosition + index,
            })
          })
          maxPositionByBoard.set(board.id, basePosition + sorted.length - 1)
          boardSummary.push({
            id: board.id,
            brand: board.brand,
            position: board.position,
            lookCount: sorted.length,
          })
        }

        const insertedLooks =
          lookValues.length > 0 ? await db().insert(looks).values(lookValues).returning() : []

        const boardPosition = new Map(boardSummary.map((board) => [board.id, board.position]))
        const lookSummary: ImportedLook[] = insertedLooks
          .map((look) => ({
            id: look.id,
            boardId: look.boardId,
            brand: look.brand,
            lookNo: look.lookNo,
            season: look.season,
            readSource: look.readSource as ImportedLook["readSource"],
            confidence: Number(look.confidence ?? 0),
            imageUrl: imageUrlFor(look.imagePublicId ?? look.sourcePublicId ?? "", ""),
            sourcePublicId: look.sourcePublicId,
          }))
          .sort(
            (a, b) =>
              (boardPosition.get(a.boardId) ?? 0) - (boardPosition.get(b.boardId) ?? 0) ||
              a.lookNo - b.lookNo,
          )

        const counts: ImportBatchCounts = {
          images: images.length,
          boards: boardSummary.length,
          readFromImage: images.filter((image) => image.readSource === "image").length,
          readFromFilename: images.filter((image) => image.readSource === "filename").length,
          readFromSequence: images.filter((image) => image.readSource === "sequence").length,
        }

        return { boards: boardSummary, looks: lookSummary, counts }
      },
    )

    const payload: ImportBatchResult = {
      ok: true,
      jobId,
      importId: importId ?? undefined,
      boards: grouped.boards,
      looks: grouped.looks,
      counts: grouped.counts,
    }
    return NextResponse.json(payload)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not build the boards" },
      { status: 500 },
    )
  }
}

