/**
 * /b/[token] — the public client board and review (Act 2, FR-9 + FR-10 + FR-11).
 *
 * Open review: brand sections, image-forward, with approve / pass / priority / note per look and a
 * sticky summary bar that leads to /b/[token]/review.
 * Submitted review: the same board, read-only, with "submitted <time>" and no controls.
 *
 * Trust boundary: the URL carries an opaque HMAC token only. Every request — and every mutation in
 * src/server/actions/review.ts — re-verifies the signature (scope "client"), requires a publishedAt,
 * and requires the token's sha256 to match the hash stored at publish time. Any failure renders the
 * 404, never a partial board.
 */
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { BoardFooter } from "@/components/client-board/BoardFooter"
import { BrandSection } from "@/components/client-board/BrandSection"
import { ClientHeader } from "@/components/client-board/ClientHeader"
import { LookDecisionReadOnly } from "@/components/client-board/LookDecisionReadOnly"
import { LookReviewControls } from "@/components/client-board/LookReviewControls"
import { ReviewSubmittedBanner } from "@/components/client-board/ReviewSubmittedBanner"
import { SubmitBar } from "@/components/client-board/SubmitBar"
import styles from "@/components/client-board/client-board.module.css"
import { authorizeClientToken, isReviewOpen, reviewCounts, sectionsFor } from "@/server/queries/review"

/** A published board changes only when the stylist re-publishes — never serve a cached snapshot. */
export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Pull — your looks",
  // A signed client link must never end up in a search index.
  robots: { index: false, follow: false, nocache: true },
}

export default async function ClientBoardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const ctx = await authorizeClientToken(token)
  if (!ctx) notFound()

  const reviewOpen = isReviewOpen(ctx.job)
  const counts = reviewCounts(ctx.looks)
  const sections = sectionsFor(ctx)
  const submittedAt = ctx.job.reviewSubmittedAt

  let offset = 0

  return (
    <div className={styles.page}>
      <div className="container">
        <ClientHeader
          clientName={ctx.job.clientName}
          title={ctx.job.title}
          shootDate={ctx.job.shootDate}
          lookCount={ctx.looks.length}
          houseCount={sections.length}
          reviewOpen={reviewOpen}
        />
        {!reviewOpen && submittedAt ? (
          <ReviewSubmittedBanner submittedAt={submittedAt} counts={counts} />
        ) : null}
      </div>

      <main className={`container ${styles.main}`}>
        {sections.length === 0 ? (
          <section className={styles.empty}>
            <p className="eyebrow on-dark">this board is empty</p>
            <p className={`mono ${styles.meta}`} style={{ marginTop: 10 }}>
              no looks have been published for this shoot yet
            </p>
          </section>
        ) : (
          sections.map((section) => {
            const startIndex = offset
            offset += section.looks.length
            return (
              <BrandSection
                key={section.board.id}
                brand={section.board.brand}
                looks={section.looks}
                startIndex={startIndex}
                actionsFor={(look) =>
                  reviewOpen ? (
                    <LookReviewControls token={token} look={look} />
                  ) : (
                    <LookDecisionReadOnly look={look} />
                  )
                }
              />
            )
          })
        )}
      </main>

      <BoardFooter lookCount={ctx.looks.length} houseCount={sections.length} />

      {reviewOpen ? <SubmitBar token={token} counts={counts} /> : null}
    </div>
  )
}
