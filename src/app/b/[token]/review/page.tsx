/**
 * /b/[token]/review — the client summary before it goes back (Act 2, FR-11; PRD §12).
 *
 * Counts + a preview of what is being approved (with priorities and notes), then one confirm button.
 * Submitting closes the review: the board locks, `reviewSubmittedAt` is stamped once, and this page
 * becomes a read-only receipt.
 */
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { boardImage } from "@/components/client-board/image"
import { formatSubmittedAt } from "@/components/client-board/datetime"
import styles from "@/components/client-board/client-board.module.css"
import { submitReviewForm } from "@/server/actions/review"
import {
  authorizeClientToken,
  isReviewOpen,
  reviewCounts,
  sectionsFor,
  type BoardRow,
  type LookRow,
} from "@/server/queries/review"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Pull — review & send",
  robots: { index: false, follow: false, nocache: true },
}

function stars(priority: number | null): string {
  const filled = priority ?? 0
  return `${"★".repeat(filled)}${"☆".repeat(3 - filled)}`
}

function SummaryLook({ look, showStars }: { look: LookRow; showStars: boolean }) {
  const image = boardImage(look.imagePublicId ?? look.sourcePublicId)
  const note = look.clientNote?.trim()
  return (
    <div className={styles.summaryLook}>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className={styles.summaryThumb}
          src={image.src}
          srcSet={image.srcSet}
          sizes="64px"
          width={900}
          height={1200}
          alt={`${look.brand} look ${look.lookNo}`}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span className={styles.summaryThumb} aria-hidden="true" />
      )}
      <div className={styles.summaryLookBody}>
        <div className={styles.summaryLookHead}>
          <span className={styles.summaryLookNo}>
            {look.brand} · look {look.lookNo}
            {look.season ? ` · ${look.season}` : ""}
          </span>
          {showStars ? (
            <span className={styles.summaryStars} aria-label={`${look.priority ?? 0} of 3 stars`}>
              {stars(look.priority)}
            </span>
          ) : null}
        </div>
        <p className={styles.summaryMeta}>{look.status}</p>
        {note ? <p className={styles.summaryNote}>{note}</p> : null}
      </div>
    </div>
  )
}

function brandSections(boards: BoardRow[], looks: LookRow[]) {
  return boards
    .map((board) => ({
      board,
      looks: looks.filter((look) => look.boardId === board.id),
    }))
    .filter((section) => section.looks.length > 0)
}

export default async function ClientReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const ctx = await authorizeClientToken(token)
  if (!ctx) notFound()

  const reviewOpen = isReviewOpen(ctx.job)
  const counts = reviewCounts(ctx.looks)
  const approved = ctx.looks.filter((look) => look.status === "approved")
  const passed = ctx.looks.filter((look) => look.status === "passed")
  const approvedByBrand = brandSections(ctx.boards, approved)
  const passedByBrand = brandSections(ctx.boards, passed)
  const undecidedWithNote = ctx.looks.filter(
    (look) => look.status === "draft" && (look.clientNote ?? "").trim().length > 0,
  )

  return (
    <div className={styles.page}>
      <div className="container">
        <div className={styles.summaryTop}>
          <span className="wordmark">PULL.</span>
          <Link className={styles.backLink} href={`/b/${token}`}>
            ← back to the board
          </Link>
        </div>
      </div>

      <main className={`container ${styles.main}`}>
        <div className={styles.summary}>
          <p className="eyebrow on-dark">{reviewOpen ? "before it goes back" : "sent to Juje"}</p>
          <h1 className={`display ${styles.summaryTitle}`}>
            {reviewOpen
              ? `${counts.approved} ${counts.approved === 1 ? "look" : "looks"} for Juje`
              : "Your review is in."}
          </h1>
          <p className={styles.summaryLead}>
            {reviewOpen
              ? "Juje gets your priorities and notes as a report, then drafts one request per house. Nothing is locked until you send it."
              : `Juje has the report and is drafting the requests. Submitted ${formatSubmittedAt(
                  ctx.job.reviewSubmittedAt ?? new Date(),
                )}.`}
          </p>

          <div className={styles.countGrid}>
            <div className={styles.countCell}>
              <div className="n">{counts.approved}</div>
              <div className="l">approved</div>
            </div>
            <div className={styles.countCell}>
              <div className="n">{counts.passed}</div>
              <div className="l">passed</div>
            </div>
            <div className={styles.countCell}>
              <div className="n">{counts.mustHaves}</div>
              <div className="l">must-haves</div>
            </div>
          </div>

          <section className={styles.summarySection} aria-label="approved looks">
            <h2 className={styles.summarySectionTitle}>approved</h2>
            {approvedByBrand.length === 0 ? (
              <p className={styles.summaryEmpty}>No looks approved yet.</p>
            ) : (
              approvedByBrand.map((section) => (
                <div key={section.board.id}>
                  {approvedByBrand.length > 1 ? (
                    <p className={styles.summaryMeta} style={{ margin: "10px 0 2px" }}>
                      {section.board.brand}
                    </p>
                  ) : null}
                  {section.looks.map((look) => (
                    <SummaryLook key={look.id} look={look} showStars />
                  ))}
                </div>
              ))
            )}
          </section>

          <section className={styles.summarySection} aria-label="passed looks">
            <h2 className={styles.summarySectionTitle}>passed</h2>
            {passedByBrand.length === 0 ? (
              <p className={styles.summaryEmpty}>Nothing passed.</p>
            ) : (
              passedByBrand.map((section) => (
                <div key={section.board.id}>
                  {section.looks.map((look) => (
                    <SummaryLook key={look.id} look={look} showStars={false} />
                  ))}
                </div>
              ))
            )}
          </section>

          {undecidedWithNote.length > 0 ? (
            <section className={styles.summarySection} aria-label="notes on undecided looks">
              <h2 className={styles.summarySectionTitle}>notes on undecided looks</h2>
              {undecidedWithNote.map((look) => (
                <SummaryLook key={look.id} look={look} showStars={false} />
              ))}
            </section>
          ) : null}

          {reviewOpen ? (
            <form action={submitReviewForm} className={styles.confirmForm}>
              <input type="hidden" name="token" value={token} />
              <button type="submit" className={styles.confirmBtn}>
                send to Juje
              </button>
              <p className={styles.confirmNote}>
                {counts.undecided > 0
                  ? `${counts.undecided} still undecided · `
                  : ""}
                you can keep editing until you send
              </p>
            </form>
          ) : (
            <div className={styles.lockedBox}>
              <p>The board is locked. Further edits need Juje to reopen the review.</p>
              <p>
                Submitted {formatSubmittedAt(ctx.job.reviewSubmittedAt ?? new Date())} ·{" "}
                {counts.approved} approved · {counts.passed} passed · {counts.mustHaves} must-haves
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
