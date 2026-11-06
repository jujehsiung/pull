"use client"

/**
 * The Act 1 drop zone (PRD §4 Act 1, FR-2..FR-5, FR-23).
 *
 * One file's life: validate → sign (server) → upload direct to Cloudinary → read the caption in the
 * browser with tesseract.js → parse look/season/brand → review thumbnail. Files run independently,
 * so a failed upload is retried on its own and never blocks the rest of the drop.
 *
 * Nothing is written to the database until "Build boards" — that POSTs the whole batch (with each
 * browser-measured step and its original timestamp) to `/api/studio/import`, which records the
 * trace, groups looks into boards and inserts them. Publishing is a separate, deliberate act.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import type { ChangeEvent, DragEvent } from "react"
import { ocrImage, terminateOcr } from "@/lib/agent/ocr"
import { parseLook, type ParsedLook } from "@/lib/agent/parse"
import {
  BOARD_TRANSFORM,
  TRACE_TOOLS,
  loadSampleFiles,
  mintSignedUpload,
  uploadToCloudinary,
  validateImageFile,
  type CloudinaryUpload,
  type SignedUpload,
} from "./cloudinary-upload"
import type {
  ImportBatchResult,
  ImportDropzoneProps,
  ImportFailurePayload,
  ImportImagePayload,
  ImportRequest,
  ImportStepName,
  ImportStepTiming,
} from "./types"

const MAX_FILES = 40

type ItemStatus = "queued" | "uploading" | "reading" | "ready" | "error"

interface ImportItem {
  id: string
  file: File
  previewUrl: string
  /** 1-based position in the drop; the last-resort read source for a missing look number. */
  sequence: number
  status: ItemStatus
  /** Upload progress, 0–100. */
  progress: number
  error?: string
  errorStep?: ImportStepName
  uploaded?: CloudinaryUpload
  ocr?: { text: string; confidence: number }
  parsed?: ParsedLook
  steps: Partial<Record<ImportStepName, ImportStepTiming>>
  ats: Partial<Record<ImportStepName, string>>
}

/** A step failed; carries which one so the tile + trace report the right tool. */
class StepFailure extends Error {
  readonly step: ImportStepName
  constructor(step: ImportStepName, message: string) {
    super(message)
    this.name = "StepFailure"
    this.step = step
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID()
  return `imp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function toImagePayload(item: ImportItem): ImportImagePayload | null {
  if (!item.uploaded || !item.ocr || !item.parsed) return null
  const step = (name: ImportStepName): ImportStepTiming =>
    item.steps[name] ?? { status: "error", durationMs: 0, error: "that step did not run" }
  return {
    filename: item.file.name,
    sourcePublicId: item.uploaded.publicId,
    imagePublicId: item.uploaded.publicId,
    secureUrl: item.uploaded.secureUrl,
    width: item.uploaded.width,
    height: item.uploaded.height,
    lookNo: item.parsed.lookNo,
    season: item.parsed.season,
    brand: item.parsed.brand,
    confidence: item.parsed.confidence,
    readSource: item.parsed.readSource,
    ocrText: item.ocr.text,
    ocrConfidence: item.ocr.confidence,
    steps: {
      upload: step("upload"),
      trim: step("trim"),
      ocr: step("ocr"),
      parse: step("parse"),
      ats: item.ats,
    },
  }
}

function toFailurePayload(item: ImportItem): ImportFailurePayload | null {
  if (item.status !== "error" || !item.error) return null
  const step = item.errorStep ?? "upload"
  return {
    filename: item.file.name,
    tool: TRACE_TOOLS[step],
    error: item.error,
    durationMs: item.steps[step]?.durationMs ?? 0,
    at: item.ats[step],
  }
}

function phaseLabel(item: ImportItem): string {
  switch (item.status) {
    case "queued":
      return "QUEUED"
    case "uploading":
      return `UPLOADING ${item.progress}%`
    case "reading":
      return "READING CAPTION"
    case "ready":
      return "READY"
    case "error":
      return `FAILED · ${(item.errorStep ?? "upload").toUpperCase()}`
  }
}

export function ImportDropzone({
  jobId,
  onImported,
  onBusyChange,
  showSampleButton = true,
}: ImportDropzoneProps) {
  const [items, setItems] = useState<ImportItem[]>([])
  const [rejects, setRejects] = useState<string[]>([])
  const [dragging, setDragging] = useState(false)
  const [loadingSamples, setLoadingSamples] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [result, setResult] = useState<ImportBatchResult | null>(null)

  const itemsRef = useRef<ImportItem[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const signedRef = useRef<SignedUpload | null>(null)
  const signedPromiseRef = useRef<Promise<SignedUpload> | null>(null)
  const importIdRef = useRef<string | null>(null)
  const attemptsRef = useRef<Map<string, number>>(new Map())

  /** Write through a single ref so a run started in the same tick sees the new items immediately. */
  const commit = useCallback((updater: (prev: ImportItem[]) => ImportItem[]) => {
    const next = updater(itemsRef.current)
    itemsRef.current = next
    setItems(next)
  }, [])

  const patch = useCallback(
    (id: string, changes: Partial<ImportItem>) => {
      commit((prev) => prev.map((item) => (item.id === id ? { ...item, ...changes } : item)))
    },
    [commit],
  )

  const ensureSigned = useCallback(async (): Promise<SignedUpload> => {
    if (signedRef.current) return signedRef.current
    if (!signedPromiseRef.current) {
      signedPromiseRef.current = mintSignedUpload(jobId)
        .then((signed) => {
          signedRef.current = signed
          return signed
        })
        .catch((error: unknown) => {
          signedPromiseRef.current = null
          throw error
        })
    }
    return signedPromiseRef.current
  }, [jobId])

  const runItem = useCallback(
    async (itemId: string) => {
      const item = itemsRef.current.find((candidate) => candidate.id === itemId)
      if (!item) return
      const attempt = (attemptsRef.current.get(itemId) ?? 0) + 1
      attemptsRef.current.set(itemId, attempt)
      const isCurrent = () => attemptsRef.current.get(itemId) === attempt

      const steps: Partial<Record<ImportStepName, ImportStepTiming>> = {}
      const ats: Partial<Record<ImportStepName, string>> = {}
      patch(itemId, {
        status: "uploading",
        progress: 0,
        error: undefined,
        errorStep: undefined,
        uploaded: undefined,
        ocr: undefined,
        parsed: undefined,
        steps,
        ats,
      })

      try {
        const signed = await ensureSigned()
        if (!isCurrent()) return

        // 1. Upload — browser → Cloudinary directly (FR-2).
        const uploadAt = Date.now()
        ats.upload = new Date(uploadAt).toISOString()
        let uploaded: CloudinaryUpload
        try {
          uploaded = await uploadToCloudinary(item.file, signed, (percent) => {
            if (isCurrent()) patch(itemId, { progress: percent })
          })
          steps.upload = { status: "ok", durationMs: Date.now() - uploadAt }
        } catch (error) {
          steps.upload = { status: "error", durationMs: Date.now() - uploadAt, error: messageOf(error) }
          throw new StepFailure("upload", messageOf(error))
        }
        if (!isCurrent()) return
        patch(itemId, { status: "reading", progress: 100, uploaded, steps: { ...steps }, ats: { ...ats } })

        // 2. Crop — Cloudinary applies the trim at delivery, so this step is the derivation, not a request.
        const trimAt = Date.now()
        ats.trim = new Date(trimAt).toISOString()
        steps.trim = { status: "ok", durationMs: Math.max(0, Date.now() - trimAt) }

        // 3. OCR — browser tesseract.js worker (FR-4).
        const ocrAt = Date.now()
        ats.ocr = new Date(ocrAt).toISOString()
        let ocr: { text: string; confidence: number; durationMs: number }
        try {
          ocr = await ocrImage(item.file)
          steps.ocr = { status: "ok", durationMs: ocr.durationMs || Date.now() - ocrAt }
        } catch (error) {
          steps.ocr = { status: "error", durationMs: Date.now() - ocrAt, error: messageOf(error) }
          throw new StepFailure("ocr", messageOf(error))
        }
        if (!isCurrent()) return

        // 4. Parse — image first, filename second, sequence last (FR-4).
        const parseAt = Date.now()
        ats.parse = new Date(parseAt).toISOString()
        let parsed: ParsedLook
        try {
          parsed = parseLook(ocr.text, item.file.name, item.sequence)
          steps.parse = { status: "ok", durationMs: Date.now() - parseAt }
        } catch (error) {
          steps.parse = { status: "error", durationMs: Date.now() - parseAt, error: messageOf(error) }
          throw new StepFailure("parse", messageOf(error))
        }
        if (!isCurrent()) return

        patch(itemId, { status: "ready", uploaded, ocr, parsed, steps: { ...steps }, ats: { ...ats } })
      } catch (error) {
        const step = error instanceof StepFailure ? error.step : "upload"
        if (isCurrent()) {
          patch(itemId, {
            status: "error",
            error: messageOf(error),
            errorStep: step,
            steps: { ...steps },
            ats: { ...ats },
          })
        }
      }
    },
    [ensureSigned, patch],
  )

  const addFiles = useCallback(
    (incoming: File[]) => {
      if (incoming.length === 0) return
      if (result) {
        setRejects(["the boards for this drop are already built — review them on the job page"])
        return
      }
      const existing = itemsRef.current
      const seen = new Set(existing.map((item) => `${item.file.name}:${item.file.size}:${item.file.lastModified}`))
      const rejected: string[] = []
      const accepted: ImportItem[] = []

      for (const file of incoming) {
        if (existing.length + accepted.length >= MAX_FILES) {
          rejected.push(`${file.name} — 40 images maximum`)
          continue
        }
        const invalid = validateImageFile(file)
        if (invalid) {
          rejected.push(`${file.name} — ${invalid}`)
          continue
        }
        const key = `${file.name}:${file.size}:${file.lastModified}`
        if (seen.has(key)) {
          rejected.push(`${file.name} — already added`)
          continue
        }
        seen.add(key)
        accepted.push({
          id: uid(),
          file,
          previewUrl: URL.createObjectURL(file),
          sequence: existing.length + accepted.length + 1,
          status: "queued",
          progress: 0,
          steps: {},
          ats: {},
        })
      }

      setRejects(rejected)
      if (accepted.length === 0) return
      if (!importIdRef.current) importIdRef.current = uid()
      commit((prev) => [...prev, ...accepted])
      for (const item of accepted) void runItem(item.id)
    },
    [commit, result, runItem],
  )

  const removeItem = useCallback(
    (itemId: string) => {
      const item = itemsRef.current.find((candidate) => candidate.id === itemId)
      if (item) URL.revokeObjectURL(item.previewUrl)
      attemptsRef.current.delete(itemId)
      commit((prev) => prev.filter((candidate) => candidate.id !== itemId))
    },
    [commit],
  )

  const clearAll = useCallback(() => {
    for (const item of itemsRef.current) {
      URL.revokeObjectURL(item.previewUrl)
      attemptsRef.current.delete(item.id)
    }
    commit(() => [])
    importIdRef.current = null
    signedRef.current = null
    signedPromiseRef.current = null
    setRejects([])
    setSubmitError(null)
  }, [commit])

  const loadSamples = useCallback(async () => {
    if (loadingSamples || result) return
    setLoadingSamples(true)
    try {
      addFiles(await loadSampleFiles())
    } catch (error) {
      setRejects([messageOf(error)])
    } finally {
      setLoadingSamples(false)
    }
  }, [addFiles, loadingSamples, result])

  const buildBoards = useCallback(async () => {
    if (submitting || result) return
    const ready = itemsRef.current.filter((item) => item.status === "ready")
    const failed = itemsRef.current.filter((item) => item.status === "error")
    if (ready.length === 0) {
      setSubmitError("Nothing has been read yet — retry the failed files, or add images.")
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    try {
      const payload: ImportRequest = {
        jobId,
        importId: importIdRef.current ?? undefined,
        images: ready
          .map(toImagePayload)
          .filter((image): image is ImportImagePayload => image !== null),
        failures: failed
          .map(toFailurePayload)
          .filter((failure): failure is ImportFailurePayload => failure !== null),
      }
      const response = await fetch("/api/studio/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      })
      const body = (await response.json().catch(() => null)) as (ImportBatchResult & { error?: string }) | null
      if (!response.ok || !body) {
        throw new Error(body?.error ?? `The import failed (${response.status}).`)
      }
      setResult(body)
      onImported?.(body)
    } catch (error) {
      setSubmitError(messageOf(error))
    } finally {
      setSubmitting(false)
    }
  }, [jobId, onImported, result, submitting])

  const busy =
    submitting || items.some((item) => item.status === "queued" || item.status === "uploading" || item.status === "reading")

  useEffect(() => {
    onBusyChange?.(busy)
  }, [busy, onBusyChange])

  useEffect(() => {
    return () => {
      void terminateOcr()
      for (const item of itemsRef.current) URL.revokeObjectURL(item.previewUrl)
    }
  }, [])

  const readyCount = items.filter((item) => item.status === "ready").length
  const workingCount = items.filter((item) => item.status === "uploading" || item.status === "reading").length
  const failedCount = items.filter((item) => item.status === "error").length

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    addFiles(Array.from(event.dataTransfer.files))
  }

  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(event.target.files ?? []))
    event.target.value = ""
  }

  return (
    <section aria-label="Import look screenshots" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <p className="eyebrow">Import · act 1</p>
        <span
          role="status"
          className="mono"
          style={{ fontSize: 10, letterSpacing: ".1em", color: "var(--muted-2)" }}
        >
          {items.length} OF {MAX_FILES}
          {readyCount ? ` · ${readyCount} READY` : ""}
          {workingCount ? ` · ${workingCount} WORKING` : ""}
          {failedCount ? ` · ${failedCount} FAILED` : ""}
        </span>
      </div>

      {result ? (
        <BuildSummary result={result} />
      ) : (
        <>
          <div
            onDragOver={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 10,
              padding: "clamp(24px, 4vw, 44px) 20px",
              borderRadius: "var(--r-md)",
              border: `1px dashed ${dragging ? "var(--accent)" : "var(--line-strong)"}`,
              background: dragging ? "var(--accent-soft)" : "var(--card)",
              textAlign: "center",
              transition: "border-color 150ms ease, background 150ms ease",
            }}
          >
            <p className="h3">Drop screenshots, 1–40.</p>
            <p className="small" style={{ maxWidth: 460 }}>
              Each one uploads straight to Cloudinary, then the browser reads the caption printed in
              the image and builds the boards. jpg, png or webp · 20 MB each.
            </p>
            <div className="row" style={{ justifyContent: "center", marginTop: 4 }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => inputRef.current?.click()}
                style={{ minHeight: 44 }}
              >
                Choose files
              </button>
              {showSampleButton ? (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => void loadSamples()}
                  disabled={loadingSamples}
                  style={{ minHeight: 44 }}
                >
                  {loadingSamples ? "Loading samples…" : "Use the 10 sample looks"}
                </button>
              ) : null}
            </div>
            {rejects.length ? (
              <ul
                role="alert"
                className="small"
                style={{ listStyle: "none", padding: 0, margin: "4px 0 0", color: "var(--danger)" }}
              >
                {rejects.map((reject) => (
                  <li key={reject}>{reject}</li>
                ))}
              </ul>
            ) : null}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
            multiple
            hidden
            onChange={onPick}
          />

          {items.length > 0 ? (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))",
                  gap: 10,
                }}
              >
                {items.map((item) => (
                  <ImportTile
                    key={item.id}
                    item={item}
                    onRetry={() => void runItem(item.id)}
                    onRemove={() => removeItem(item.id)}
                  />
                ))}
              </div>

              <div className="row" style={{ justifyContent: "space-between" }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={clearAll}
                  disabled={workingCount > 0 || submitting}
                >
                  Clear
                </button>
                <div className="row" style={{ justifyContent: "flex-end" }}>
                  {failedCount ? (
                    <span className="small" style={{ color: "var(--danger)" }}>
                      {failedCount} failed — retry individually
                    </span>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void buildBoards()}
                    disabled={readyCount === 0 || submitting || workingCount > 0}
                    style={{ minHeight: 44 }}
                  >
                    {submitting
                      ? "Building boards…"
                      : `Build boards · ${readyCount} look${readyCount === 1 ? "" : "s"}`}
                  </button>
                </div>
              </div>
              {submitError ? (
                <p className="small" role="alert" style={{ color: "var(--danger)" }}>
                  {submitError}
                </p>
              ) : null}
              <p className="small" style={{ color: "var(--muted-2)" }}>
                Building the boards does not publish anything. Review and edit every look on the job
                page before you press Publish.
              </p>
            </>
          ) : null}
        </>
      )}
    </section>
  )
}

function BuildSummary({ result }: { result: ImportBatchResult }) {
  return (
    <div className="card" aria-live="polite">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <p className="eyebrow">{result.alreadyImported ? "Boards already built" : "Boards built"}</p>
        <span className="mono" style={{ fontSize: 10, letterSpacing: ".1em", color: "var(--muted-2)" }}>
          {result.counts.images} LOOKS · {result.boards.length} BOARDS
        </span>
      </div>
      <div className="row" style={{ gap: 6, marginTop: 12 }}>
        {result.boards.map((board) => (
          <span key={board.id} className="chip">
            {board.brand} · {board.lookCount}
          </span>
        ))}
      </div>
      <p className="small" style={{ marginTop: 12 }}>
        {result.counts.readFromImage} read from the image
        {result.counts.readFromFilename ? ` · ${result.counts.readFromFilename} from filename` : ""}
        {result.counts.readFromSequence ? ` · ${result.counts.readFromSequence} from sequence` : ""}.
        Every step is in the agent trace; the looks are waiting for your review, not published.
      </p>
    </div>
  )
}

function ProgressBar({ percent }: { percent: number }) {
  return (
    <span
      aria-hidden="true"
      style={{ display: "block", height: 3, background: "var(--line)", borderRadius: 2, overflow: "hidden" }}
    >
      <span
        style={{
          display: "block",
          height: "100%",
          width: `${Math.min(100, Math.max(0, percent))}%`,
          background: "var(--ink)",
          transition: "width 160ms ease",
        }}
      />
    </span>
  )
}

function ImportTile({
  item,
  onRetry,
  onRemove,
}: {
  item: ImportItem
  onRetry: () => void
  onRemove: () => void
}) {
  const failed = item.status === "error"
  return (
    <figure
      style={{
        margin: 0,
        border: `1px solid ${failed ? "color-mix(in srgb, var(--danger) 35%, var(--line))" : "var(--line)"}`,
        borderRadius: "var(--r-sm)",
        overflow: "hidden",
        background: "var(--card)",
      }}
    >
      <div style={{ position: "relative", aspectRatio: "3 / 4", background: "var(--paper-2)" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.previewUrl}
          alt={item.file.name}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
        {item.parsed ? (
          <span
            className="mono"
            style={{
              position: "absolute",
              left: 6,
              top: 6,
              padding: "2px 6px",
              borderRadius: 3,
              fontSize: 9,
              letterSpacing: ".1em",
              background: "rgba(0, 0, 0, 0.62)",
              color: "#fff",
            }}
          >
            LOOK {item.parsed.lookNo}
          </span>
        ) : null}
        <button
          type="button"
          aria-label={`Remove ${item.file.name}`}
          onClick={onRemove}
          style={{
            position: "absolute",
            right: 4,
            top: 4,
            width: 30,
            height: 30,
            borderRadius: "50%",
            border: 0,
            background: "rgba(0, 0, 0, 0.55)",
            color: "#fff",
            fontSize: 16,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>
      <figcaption style={{ padding: "8px 10px 10px", display: "flex", flexDirection: "column", gap: 5 }}>
        <span
          className="mono"
          style={{
            fontSize: 9,
            letterSpacing: ".08em",
            color: failed ? "var(--danger)" : "var(--muted)",
          }}
        >
          {phaseLabel(item)}
        </span>
        {item.status === "uploading" ? <ProgressBar percent={item.progress} /> : null}
        {item.status === "ready" && item.parsed ? (
          <>
            <span style={{ fontSize: 12, color: "var(--ink-2)" }}>
              {item.parsed.brand} · {item.parsed.season ?? "—"}
            </span>
            <span
              className="mono"
              style={{
                fontSize: 9,
                letterSpacing: ".08em",
                color: item.parsed.readSource === "image" ? "var(--accent)" : "var(--muted-2)",
              }}
            >
              {item.parsed.readSource === "image"
                ? "READ FROM IMAGE"
                : `FROM ${item.parsed.readSource.toUpperCase()}`}{" "}
              · {Math.round(item.parsed.confidence * 100)}%
            </span>
          </>
        ) : null}
        {failed ? (
          <>
            <span
              className="small"
              style={{ fontSize: 11, color: "var(--danger)", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}
            >
              {item.error}
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={onRetry}
              style={{ minHeight: 44, marginTop: 2 }}
            >
              Retry
            </button>
          </>
        ) : null}
      </figcaption>
    </figure>
  )
}

export default ImportDropzone
