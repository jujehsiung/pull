/**
 * Locked-board banner (FR-11). After submit the board is a record: when it was sent, the counts,
 * and that the review can no longer be changed from this link.
 */
import { formatSubmittedAt } from "./datetime"
import type { ReviewCounts } from "@/server/queries/review"
import styles from "./client-board.module.css"

interface ReviewSubmittedBannerProps {
  submittedAt: Date | string
  counts: ReviewCounts
}

export function ReviewSubmittedBanner({ submittedAt, counts }: ReviewSubmittedBannerProps) {
  return (
    <div className={styles.banner}>
      <span className={`mono ${styles.bannerText}`}>
        review submitted · {formatSubmittedAt(submittedAt)}
      </span>
      <span className={`mono ${styles.bannerText}`}>
        {counts.approved} approved · {counts.passed} passed · {counts.mustHaves} must-haves
      </span>
      <span className={`mono ${styles.bannerText}`}>the board is locked</span>
    </div>
  )
}
