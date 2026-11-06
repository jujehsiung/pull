/**
 * Browser-side OCR — tesseract.js in a worker (PRD §5, §7 step 3, FR-4).
 *
 * No server, no API key, no per-image cost: the screenshot is read in the stylist's browser while
 * the bytes go straight to Cloudinary. One worker is created lazily and reused for the drop; the
 * worker is not re-entrant, so reads are queued.
 *
 * `ocrImage()` takes a File/Blob (what the drop zone has) or an object URL, returns the text and
 * tesseract's own 0–100 confidence, and gives up after `timeoutMs` instead of hanging the import.
 * On timeout the worker is terminated so a poisoned read cannot wedge every file behind it.
 *
 * Browser only. The Node equivalent for the accuracy script is `scripts/ocr-check.mjs`, which
 * uses the same parser (`parseLook`) on the same fixtures.
 */
import type Tesseract from "tesseract.js"

type OcrWorker = Tesseract.Worker

export interface OcrRead {
  text: string
  /** tesseract's own confidence, 0–100. */
  confidence: number
  /** How long the recognize call itself took, in ms (excludes worker start-up and queue wait). */
  durationMs: number
}

export interface OcrOptions {
  /** Hard cap for worker start-up and for the read itself. Default 30 s each. */
  timeoutMs?: number
  /** 0–1, while tesseract is recognizing. */
  onProgress?: (progress: number) => void
}

const DEFAULT_TIMEOUT_MS = 30_000

let workerPromise: Promise<OcrWorker> | null = null
let progressHandler: ((progress: number) => void) | null = null
/** One tesseract worker cannot run two recognitions at once; every file queues through this. */
let queue: Promise<unknown> = Promise.resolve()

async function makeWorker(): Promise<OcrWorker> {
  const { createWorker } = await import("tesseract.js")
  return createWorker("eng", 1, {
    logger: (message) => {
      if (message.status === "recognizing text") progressHandler?.(message.progress)
    },
  })
}

function getWorker(): Promise<OcrWorker> {
  if (!workerPromise) {
    workerPromise = makeWorker().catch((error: unknown) => {
      workerPromise = null
      throw error
    })
  }
  return workerPromise
}

async function resetWorker(): Promise<void> {
  const current = workerPromise
  workerPromise = null
  progressHandler = null
  if (!current) return
  try {
    const worker = await current
    await worker.terminate()
  } catch {
    // The worker may already be gone after a crash/timeout — that is exactly why we are here.
  }
}

/** Release the worker when the drop zone unmounts. Safe to call when nothing was started. */
export async function terminateOcr(): Promise<void> {
  await resetWorker()
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${Math.round(ms / 1000)} s`))
    }, ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error("That image could not be read by the browser."))
    reader.readAsDataURL(blob)
  })
}

/**
 * tesseract's worker fetches its input; blob: object URLs created on the page are not reliably
 * visible from inside the worker, so hand it a data URL instead.
 */
async function toImageLike(source: File | Blob | string): Promise<string> {
  if (typeof source === "string") {
    if (source.startsWith("data:")) return source
    if (source.startsWith("blob:")) {
      const blob = await fetch(source).then((response) => response.blob())
      return blobToDataUrl(blob)
    }
    return source
  }
  return blobToDataUrl(source)
}

function serialise<T>(run: () => Promise<T>): Promise<T> {
  const next = queue.then(run, run)
  queue = next.then(
    () => undefined,
    () => undefined,
  )
  return next
}

/**
 * OCR one image. Resolves with the text and confidence; rejects with a readable message on
 * timeout or worker failure. Concurrent calls are serialised internally.
 */
export function ocrImage(source: File | Blob | string, options: OcrOptions = {}): Promise<OcrRead> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  return serialise(async () => {
    progressHandler = options.onProgress ?? null
    try {
      const worker = await withTimeout(getWorker(), timeoutMs, "OCR engine")
      const image = await toImageLike(source)
      const startedAt = Date.now()
      const { data } = await withTimeout(worker.recognize(image), timeoutMs, "OCR")
      return {
        text: (data.text ?? "").trim(),
        confidence: Math.round(data.confidence ?? 0),
        durationMs: Date.now() - startedAt,
      }
    } catch (error) {
      if (error instanceof Error && /timed out/i.test(error.message)) await resetWorker()
      throw error
    } finally {
      progressHandler = null
    }
  })
}
