/**
 * Client board header — the small PULL wordmark, who the board is for, the shoot date, and the
 * job title as the hero. Deliberately no links back to the studio (the client has no session).
 */
import styles from "./client-board.module.css"

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const

/** `2026-10-12` → `12 OCT 2026`, without going through a Date (a date column has no time zone). */
export function formatShootDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return value
  const [, year, month, day] = match
  const label = MONTHS[Number(month) - 1]
  if (!label) return value
  return `${day} ${label} ${year}`
}

interface ClientHeaderProps {
  clientName: string
  title: string
  shootDate: string
  lookCount: number
  houseCount: number
  /** FR-10 open vs FR-11 locked: the hero copy follows the state of the review. */
  reviewOpen: boolean
}

export function ClientHeader({
  clientName,
  title,
  shootDate,
  lookCount,
  houseCount,
  reviewOpen,
}: ClientHeaderProps) {
  return (
    <>
      <div className="client-top">
        <span className="wordmark">Pull.</span>
        <span className={`mono ${styles.topName}`}>for {clientName}</span>
        <span className={`mono ${styles.topCount}`}>
          {lookCount} {lookCount === 1 ? "look" : "looks"}
        </span>
      </div>

      <header className={`client-hero ${styles.hero}`}>
        <p className="eyebrow on-dark">your looks · {title}</p>
        <h1 className={`display ${styles.title}`}>{title}</h1>
        <p className={`lead ${styles.leadLine}`}>
          {reviewOpen
            ? "Approve, pass, star what matters. Nothing goes back to Juje until you preview the whole set and send it."
            : "Every look Juje pulled for this shoot, grouped by house. The link is the board — nothing to log in to, nothing to download."}
        </p>
        <div className={styles.metaRow}>
          <span className={`mono ${styles.meta}`}>shoot · {formatShootDate(shootDate)}</span>
          <span className={`mono ${styles.meta}`}>
            {houseCount} {houseCount === 1 ? "house" : "houses"} · {lookCount}{" "}
            {lookCount === 1 ? "look" : "looks"}
          </span>
        </div>
      </header>
    </>
  )
}
