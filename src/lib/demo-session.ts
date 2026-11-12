/**
 * The demo session — the board, the client's decisions, and the hand-off between the landing's
 * three acts. The studio flow in `/studio` is database-backed; the landing demo is a browser
 * session, so the client link is this tab: sending a shortlist writes it here, the approval page
 * and the request screen read it, and the whole chain survives navigation and a reload.
 *
 * Only what the next screen needs is stored: the job, the shortlisted looks, and the client's
 * approve/pass decisions. Nothing here pretends to be a real signed link.
 */

export interface DemoLook {
  id: string
  brand: string
  lookNo: number
  season: string | null
  /** URL (or blob/data URL for a locally cropped look). */
  src: string
}

export interface DemoBoard {
  job: {
    title: string
    client: string
    dueDate: string
    /** The occasion the board was researched for, when the start-job flow set one. */
    occasion?: string
  }
  looks: DemoLook[]
  sentAt: string
}

export interface DemoReview {
  approved: string[]
  passed: string[]
  priorities?: Record<string, number>
  notes?: Record<string, string>
  submittedAt: string
}

const BOARD_KEY = "pull.demo.board.v1"
const REVIEW_KEY = "pull.demo.review.v1"

function readJson<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    // A full quota is not worth failing the hand-off over; the page still renders the board.
  }
}

export function saveDemoBoard(board: DemoBoard) {
  writeJson(BOARD_KEY, board)
  // A new shortlist invalidates the previous review.
  try {
    sessionStorage.removeItem(REVIEW_KEY)
  } catch {
    // ignore
  }
}

export function readDemoBoard(): DemoBoard | null {
  const board = readJson<DemoBoard>(BOARD_KEY)
  return board?.looks?.length ? board : null
}

export function saveDemoReview(review: DemoReview) {
  writeJson(REVIEW_KEY, review)
}

export function readDemoReview(): DemoReview | null {
  return readJson<DemoReview>(REVIEW_KEY)
}

/** The client link in this demo is this tab's `/client` page. */
export function demoClientUrl(): string {
  if (typeof window === "undefined") return "/client"
  return `${window.location.origin}/client`
}
