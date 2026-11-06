/**
 * Wire types for the Act 1 import pipeline (PRD FR-2..FR-5, FR-23).
 *
 * The browser builds an `ImportRequest` after it has uploaded + OCR'd + parsed every file; the
 * batch route validates it, records the browser-measured steps in the agent trace, groups looks
 * into boards and returns `ImportBatchResult` for the review grid.
 */
import type { ImportReadSource } from "@/lib/agent/parse"

export type ImportStepName = "upload" | "trim" | "ocr" | "parse"
export type ImportStepStatus = "ok" | "error"

/** Tool names exactly as they appear in the agent trace (PRD §7.1 / §7 table). */
export type ImportTraceTool =
  | "cloudinary.upload"
  | "cloudinary.trim"
  | "tesseract.read"
  | "agent.parse"

/** One browser-measured step. `durationMs` is what the browser actually took. */
export interface ImportStepTiming {
  status: ImportStepStatus
  durationMs: number
  error?: string
}

export interface ImportImageSteps {
  upload: ImportStepTiming
  trim: ImportStepTiming
  ocr: ImportStepTiming
  parse: ImportStepTiming
  /** ISO start time per step, so the trace keeps the order things happened, not the order they arrived. */
  ats: Partial<Record<ImportStepName, string>>
}

export interface ImportImagePayload {
  filename: string
  /** Cloudinary original. */
  sourcePublicId: string
  /** Delivery id for the trimmed board tile (same public id today; the transform is applied at delivery). */
  imagePublicId: string
  secureUrl: string
  width: number
  height: number
  lookNo: number
  season: string | null
  brand: string
  /** parse confidence, 0–1 (tesseract's own 0–100 confidence is `ocrConfidence`). */
  confidence: number
  readSource: ImportReadSource
  ocrText: string
  ocrConfidence: number
  steps: ImportImageSteps
}

/** A file that never made it into `images`; recorded as an error step so failures are visible too. */
export interface ImportFailurePayload {
  filename: string
  tool: ImportTraceTool
  error: string
  durationMs: number
  at?: string
}

export interface ImportRequest {
  jobId: string
  /** Stable per drop; retrying the batch with the same id must not duplicate rows. */
  importId?: string
  images: ImportImagePayload[]
  failures?: ImportFailurePayload[]
}

export interface ImportedBoard {
  id: string
  brand: string
  position: number
  lookCount: number
}

export interface ImportedLook {
  id: string
  boardId: string
  brand: string
  lookNo: number
  season: string | null
  readSource: ImportReadSource
  confidence: number
  /** Trimmed Cloudinary delivery URL for the review grid. */
  imageUrl: string
  sourcePublicId: string | null
}

export interface ImportBatchCounts {
  images: number
  boards: number
  readFromImage: number
  readFromFilename: number
  readFromSequence: number
}

export interface ImportBatchResult {
  ok: true
  jobId: string
  importId?: string
  boards: ImportedBoard[]
  looks: ImportedLook[]
  counts: ImportBatchCounts
  /** True when the same `importId` had already been written — the route replayed the first result. */
  alreadyImported?: boolean
}

export interface ImportDropzoneProps {
  jobId: string
  /** Called after the batch route has persisted the boards + looks. The studio page can refresh. */
  onImported?: (result: ImportBatchResult) => void
  /** True while files are uploading/reading or the batch is being saved. */
  onBusyChange?: (busy: boolean) => void
  /** The demo's fixture set is served from /fixtures/looks — hide the shortcut if it is not wanted. */
  showSampleButton?: boolean
}
