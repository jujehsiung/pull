/**
 * The approval hand-off — what the client decided, shared by both sides.
 *
 * The real board persists this in Postgres (`jobs.reviewSubmittedAt`, looks' status and
 * markup). This demo has no database on the deployment, so the record lives in the
 * browser: one localStorage entry that the client board writes, and the stylist's bell,
 * the approved view and the studio's assets panel all read. Same shape either way, so
 * moving it to the DB later is a swap of these three functions.
 */
export interface ApprovedLook {
  id: string
  brand: string
  lookNo: number
  season: string | null
  /** The look photograph — a fixture path in the demo. */
  image: string
  /** The client's markup, a transparent PNG data URL drawn over the photograph. */
  markup?: string
  approvedAt: number
}

export interface ApprovalRecord {
  job: string
  client: string
  submittedAt: number
  /** Ids the client passed, kept so both sides see the same turned-down set. */
  passed: string[]
  looks: ApprovedLook[]
}

const KEY = "pull:approval:v1"
const SEEN = "pull:approval:seen:v1"
export const APPROVAL_EVENT = "pull:approval-change"

export function readApproval(): ApprovalRecord | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return null
    const record = JSON.parse(raw) as ApprovalRecord
    return Array.isArray(record?.looks) ? record : null
  } catch {
    return null
  }
}

export function saveApproval(record: ApprovalRecord): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(KEY, JSON.stringify(record))
    window.dispatchEvent(new Event(APPROVAL_EVENT))
  } catch {
    // A full quota must not break the decision the client just made.
  }
}

export function markApprovalSeen(): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(SEEN, String(Date.now()))
    window.dispatchEvent(new Event(APPROVAL_EVENT))
  } catch {
    // Same trade.
  }
}

/** True when there is an approval the stylist has not opened yet. */
export function isApprovalUnread(record: ApprovalRecord | null = readApproval()): boolean {
  if (!record) return false
  if (typeof window === "undefined") return false
  const seen = Number(window.localStorage.getItem(SEEN) ?? 0)
  return record.submittedAt > seen
}

/** Subscribe to a new approval (and to storage changes from another tab). */
export function subscribeApproval(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {}
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY || event.key === SEEN) callback()
  }
  window.addEventListener(APPROVAL_EVENT, callback)
  window.addEventListener("storage", onStorage)
  return () => {
    window.removeEventListener(APPROVAL_EVENT, callback)
    window.removeEventListener("storage", onStorage)
  }
}

/** The approved looks, newest decision first — the studio's Approved tab. */
export function approvedAssets(record: ApprovalRecord | null = readApproval()): ApprovedLook[] {
  if (!record) return []
  return [...record.looks].sort((a, b) => b.approvedAt - a.approvedAt)
}
