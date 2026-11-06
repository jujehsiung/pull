/**
 * Quiet footer for the client board. No links back to the studio, no controls — the page ends here.
 */
import styles from "./client-board.module.css"

interface BoardFooterProps {
  lookCount: number
  houseCount: number
}

export function BoardFooter({ lookCount, houseCount }: BoardFooterProps) {
  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.footerInner}`}>
        <span className={`mono ${styles.footerText}`}>PULL · sample trafficking</span>
        <span className={`mono ${styles.footerText}`}>
          {lookCount} {lookCount === 1 ? "look" : "looks"} · {houseCount}{" "}
          {houseCount === 1 ? "house" : "houses"}
        </span>
        <span className={`mono ${styles.footerText}`}>one link · no login</span>
      </div>
    </footer>
  )
}
