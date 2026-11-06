/**
 * Sticky submit bar (FR-11): live approved / passed / must-have counts and the way into the summary.
 * Server-rendered from the DB counts, which revalidate after every per-look action.
 */
import Link from "next/link"
import type { ReviewCounts } from "@/server/queries/review"
import styles from "./client-board.module.css"

export function SubmitBar({ token, counts }: { token: string; counts: ReviewCounts }) {
  return (
    <div className={styles.submitBar}>
      <div className={`container ${styles.submitInner}`}>
        <p className={styles.counts} aria-live="polite">
          <span>
            <b>{counts.approved}</b> approved
          </span>
          <span>
            <b>{counts.passed}</b> passed
          </span>
          <span>
            <b>{counts.mustHaves}</b> must-haves
          </span>
        </p>
        <Link className={styles.submitLink} href={`/b/${token}/review`}>
          review &amp; send
        </Link>
      </div>
    </div>
  )
}
