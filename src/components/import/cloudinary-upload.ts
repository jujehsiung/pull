/**
 * Browser-side upload helpers for the Act 1 drop zone.
 *
 * The bytes go straight to Cloudinary with a short-lived signature minted by
 * `/api/studio/import/sign` (PRD §9.1) — they never pass through the Next.js route, so the
 * serverless body limit is not in the path. Progress comes from XHR because `fetch` cannot report
 * upload progress.
 */
import type { ImportStepName, ImportTraceTool } from "./types"

export interface SignedUpload {
  cloudName: string
  apiKey: string
  timestamp: number
  folder: string
  signature: string
  uploadUrl: string
}

export interface CloudinaryUpload {
  publicId: string
  secureUrl: string
  width: number
  height: number
  bytes: number
  format: string
}

/** Trace tool for each browser step — the names the trace panel groups by. */
export const TRACE_TOOLS: Record<ImportStepName, ImportTraceTool> = {
  upload: "cloudinary.upload",
  trim: "cloudinary.trim",
  ocr: "tesseract.read",
  parse: "agent.parse",
}

/**
 * The board tile is a Cloudinary delivery transform, not a stored crop and not a network call.
 * The trace records exactly that (`mode: "delivery-transform"`), because pretending a request
 * happened would undermine the point of the trace.
 */
export const BOARD_TRANSFORM = {
  mode: "delivery-transform" as const,
  effect: "trim:20",
  transformation: "e_trim:20,c_fill,w_1200,h_1600,g_auto,q_auto,f_auto",
  width: 1200,
  height: 1600,
}

/** Ask the server for one signed direct-upload, scoped to this job's folder. */
export async function mintSignedUpload(jobId: string): Promise<SignedUpload> {
  const response = await fetch("/api/studio/import/sign", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jobId }),
  })
  const body = (await response.json().catch(() => null)) as (SignedUpload & { error?: string }) | null
  if (!response.ok || !body) {
    throw new Error(body?.error ?? `Could not sign the upload (${response.status}).`)
  }
  return body
}

/** POST one file to Cloudinary, reporting 0–100 progress. Resolves with the public id. */
export function uploadToCloudinary(
  file: File,
  signed: SignedUpload,
  onProgress?: (percent: number) => void,
): Promise<CloudinaryUpload> {
  return new Promise((resolve, reject) => {
    const form = new FormData()
    form.append("file", file)
    form.append("api_key", signed.apiKey)
    form.append("timestamp", String(signed.timestamp))
    form.append("folder", signed.folder)
    form.append("signature", signed.signature)

    const xhr = new XMLHttpRequest()
    xhr.open("POST", signed.uploadUrl, true)
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress?.(Math.min(99, Math.round((event.loaded / event.total) * 100)))
      }
    }
    xhr.onload = () => {
      type CloudinaryResponse = {
        public_id?: string
        secure_url?: string
        url?: string
        width?: number
        height?: number
        bytes?: number
        format?: string
        error?: { message?: string }
      }
      let body: CloudinaryResponse | null = null
      try {
        body = JSON.parse(xhr.responseText) as CloudinaryResponse
      } catch {
        body = null
      }
      if (xhr.status >= 200 && xhr.status < 300 && body?.public_id) {
        onProgress?.(100)
        resolve({
          publicId: body.public_id,
          secureUrl: body.secure_url ?? body.url ?? "",
          width: Math.round(Number(body.width) || 0),
          height: Math.round(Number(body.height) || 0),
          bytes: Number(body.bytes) || file.size,
          format: body.format ?? "",
        })
        return
      }
      reject(new Error(body?.error?.message ?? `Cloudinary rejected the upload (${xhr.status}).`))
    }
    xhr.onerror = () => reject(new Error("Network error while uploading to Cloudinary."))
    xhr.onabort = () => reject(new Error("Upload cancelled."))
    xhr.send(form)
  })
}

/** The FR-4 acceptance set, served from public/fixtures/looks (copied from ../agent-board). */
/**
 * The fixture sets a demo can load in one click.
 *
 * `ocr` is the PRD FR-4 acceptance set: 10 synthetic screenshots that PRINT their
 * own caption, so Act 1 can prove the look number was read off the pixels.
 * `menswear` is real runway photography (public/fixtures/menswear, see
 * scripts/fetch-menswear.mjs) — no caption text, so it lands as
 * `readSource: "filename"`. Use it when the board has to look like a real
 * client's, and keep the OCR set for the moment you have to prove the reading.
 */
export type SampleSetId = "ocr" | "menswear"

const SAMPLE_SETS: Record<SampleSetId, { manifest: string; dir: string }> = {
  ocr: { manifest: "/fixtures/looks/manifest.json", dir: "/fixtures/looks" },
  menswear: { manifest: "/fixtures/menswear/manifest.json", dir: "/fixtures/menswear" },
}

export async function loadSampleFiles(set: SampleSetId = "ocr"): Promise<File[]> {
  const { manifest: manifestUrl, dir } = SAMPLE_SETS[set]
  const manifestResponse = await fetch(manifestUrl, { cache: "no-store" })
  if (!manifestResponse.ok) throw new Error("The sample fixture set is not being served.")
  const manifest = (await manifestResponse.json()) as {
    files?: (string | { file?: string })[]
  }
  // `files` is a list of names in the FR-4 set, and may carry per-image records
  // (brand/credit) elsewhere. Accept either shape.
  const names = (Array.isArray(manifest.files) ? manifest.files : [])
    .map((entry) => (typeof entry === "string" ? entry : entry?.file))
    .filter((name): name is string => Boolean(name))
  if (names.length === 0) throw new Error("The sample fixture manifest is empty.")

  const files: File[] = []
  for (const name of names) {
    const response = await fetch(`${dir}/${encodeURIComponent(name)}`, { cache: "no-store" })
    if (!response.ok) throw new Error(`Could not load the sample ${name}.`)
    const blob = await response.blob()
    files.push(new File([blob], name, { type: blob.type || "image/png" }))
  }
  return files
}

/** FR-2: jpg/png/webp, ≤ 20 MB. Returns a human-readable reason, or null when the file is fine. */
export function validateImageFile(file: File): string | null {
  const name = file.name.toLowerCase()
  const typeOk =
    ["image/jpeg", "image/png", "image/webp"].includes(file.type) || /\.(jpe?g|png|webp)$/.test(name)
  if (!typeOk) return "not a jpg, png or webp"
  if (file.size === 0) return "the file is empty"
  if (file.size > 20 * 1024 * 1024) return "over the 20 MB limit"
  return null
}
