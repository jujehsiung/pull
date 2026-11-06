/**
 * Read-only decision summary rendered in a look card's controls slot once the review is locked
 * (FR-11). Shows what the client decided so the board still reads as a record, not just as images.
 */
import type { LookCardLook } from "./types"
import styles from "./client-board.module.css"

export function LookDecisionReadOnly({ look }: { look: LookCardLook }) {
  const note = look.clientNote?.trim()
  const decided = look.status !== "draft"
  if (!decided && !note) return null

  return (
    <div className={styles.readOnly}>
      {decided ? (
        <div className={styles.readOnlyRow}>
          <span className={styles.readOnlyLabel}>decision</span>
          <span className={styles.readOnlyValue}>{look.status}</span>
        </div>
      ) : null}
      {look.status === "approved" && look.priority ? (
        <div className={styles.readOnlyRow}>
          <span className={styles.readOnlyLabel}>priority</span>
          <span className={styles.readOnlyStars} aria-label={`${look.priority} of 3 stars`}>
            {"★".repeat(look.priority)}
            {"☆".repeat(3 - look.priority)}
          </span>
        </div>
      ) : null}
      {note ? <p className={styles.readOnlyNote}>{note}</p> : null}
    </div>
  )
}
