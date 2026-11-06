/** Shared view types for the client board components (server and client components both use them). */

export type LookStatus = "draft" | "approved" | "passed"

export interface LookCardLook {
  id: string
  lookNo: number
  season: string | null
  brand: string
  imagePublicId: string | null
  sourcePublicId: string | null
  /** FR-10 client decision. draft = not decided yet. */
  status: LookStatus
  /** 1–3 stars on an approved look; null otherwise. */
  priority: number | null
  clientNote: string | null
}
