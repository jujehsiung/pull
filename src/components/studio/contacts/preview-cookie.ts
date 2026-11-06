/**
 * The two-step CSV import keeps its parsed-but-not-written state in a short-lived httpOnly cookie.
 *
 * Why a cookie: the preview must be a real page (so the import works without JavaScript and can be
 * exercised end-to-end by curl), and no raw CSV should ever circulate in a URL or a query string.
 * The CSV is gzipped so a 200-row file still fits in one cookie; anything larger is refused with a
 * clear message rather than silently truncated.
 */
import { gunzipSync, gzipSync } from "node:zlib"
import { MAX_CSV_LENGTH } from "./csv"

export const PREVIEW_COOKIE = "pull_contacts_preview"
export const PREVIEW_TTL_MS = 10 * 60 * 1000
/** Cookie header budget is ~4 KB; keep clear of it for the action's own Set-Cookie header. */
const MAX_ENCODED_LENGTH = 3600

export interface ContactsPreviewPayload {
  userId: string
  csv: string
  exp: number
}

/** Returns null when the file cannot be carried in a cookie — the caller asks for a smaller batch. */
export function encodeContactsPreview(payload: ContactsPreviewPayload): string | null {
  try {
    const packed = gzipSync(Buffer.from(JSON.stringify(payload), "utf8"), { level: 9 })
    const encoded = packed.toString("base64url")
    return encoded.length <= MAX_ENCODED_LENGTH ? encoded : null
  } catch {
    return null
  }
}

export function decodeContactsPreview(value: string | undefined): ContactsPreviewPayload | null {
  if (!value) return null
  try {
    const json = gunzipSync(Buffer.from(value, "base64url"), {
      // Decompression bounded: a hostile cookie cannot expand into an unbounded parse.
      maxOutputLength: MAX_CSV_LENGTH * 2,
    }).toString("utf8")
    const payload = JSON.parse(json) as Partial<ContactsPreviewPayload>
    if (
      typeof payload.userId !== "string" ||
      typeof payload.csv !== "string" ||
      typeof payload.exp !== "number"
    ) {
      return null
    }
    if (payload.csv.length > MAX_CSV_LENGTH) return null
    if (payload.exp < Date.now()) return null
    return { userId: payload.userId, csv: payload.csv, exp: payload.exp }
  } catch {
    return null
  }
}
