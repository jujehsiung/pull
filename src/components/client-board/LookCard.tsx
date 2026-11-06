/**
 * One look on the client board: the cropped image, its number/season tag, its review status, and
 * the controls slot (approve/pass/priority/note in M2, or a read-only summary once the review is
 * locked). The image is the same Cloudinary transform used in M1.
 */
import type { ReactNode } from "react"
import { boardImage, BOARD_IMAGE_HEIGHT, BOARD_IMAGE_WIDTH } from "./image"
import type { LookCardLook } from "./types"
import styles from "./client-board.module.css"

interface LookCardProps {
  look: LookCardLook
  /** The first image on the board — eager + high priority so the LCP is the hero tile, not a lazy one. */
  priority?: boolean
  /** Review controls (open) or a read-only decision summary (locked). Omitted means no slot. */
  actions?: ReactNode
}

const STATUS_LABEL: Record<LookCardLook["status"], string> = {
  draft: "undecided",
  approved: "approved",
  passed: "passed",
}

export function LookCard({ look, priority = false, actions }: LookCardProps) {
  const image = boardImage(look.imagePublicId ?? look.sourcePublicId)
  const season = look.season?.trim()
  const statusClass =
    look.status === "approved" ? "selected" : look.status === "passed" ? styles.cardPassed : ""

  return (
    <article className={`look ${statusClass}`.trim()}>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image.src}
          srcSet={image.srcSet}
          sizes="(min-width: 980px) 25vw, (min-width: 640px) 33vw, 50vw"
          width={BOARD_IMAGE_WIDTH}
          height={BOARD_IMAGE_HEIGHT}
          alt={`${look.brand} look ${look.lookNo}${season ? `, ${season}` : ""}`}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
        />
      ) : (
        <div
          className={styles.missing}
          role="img"
          aria-label={`${look.brand} look ${look.lookNo} — image not available`}
        >
          <span className={styles.missingText}>image pending</span>
        </div>
      )}

      <span className="tag">
        look {look.lookNo}
        {season ? ` · ${season}` : ""}
      </span>

      {/* Status is written out, never colour alone. */}
      <span
        className={`${styles.statusChip} ${
          look.status === "approved" ? styles.statusApproved : ""
        } ${look.status === "passed" ? styles.statusPassed : ""}`.trim()}
      >
        {STATUS_LABEL[look.status]}
      </span>

      {actions ? <div className={styles.controls}>{actions}</div> : null}
    </article>
  )
}
