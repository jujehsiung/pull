"use client"

/**
 * Act 3 of the landing demo: the request emails, built from the approvals the client just sent.
 *
 * One draft per brand that has approved looks, carrying the client, the job and the delivery date.
 * With no review in this tab it shows the seeded design surface; a board that has not been approved
 * yet says it is waiting rather than showing someone else's emails.
 */
import Link from "next/link"
import { useEffect, useState } from "react"

import { readDemoBoard, readDemoReview, type DemoBoard } from "@/lib/demo-session"

import { RequestEmails, type RequestBrand, type RequestJob } from "./RequestEmails"

function contactFor(brand: string): string {
  return `pr@${brand.toLowerCase().replace(/[^a-z]/g, "")}.demo`
}

/** The landing form has one date; the draft repeats it as the shoot window. */
function jobFromBoard(board: DemoBoard): RequestJob {
  const due = board.job.dueDate
  return {
    client: board.job.client,
    title: board.job.title,
    shootDate: due,
    callInDate: due,
    returnDate: due,
    shipTo: "Pull Studio · 12 Mercer St, New York, NY 10013",
  }
}

interface RequestsView {
  job: RequestJob
  brands: RequestBrand[]
  demo: boolean
  waiting: boolean
}

export function RequestsFromReview({
  fallbackJob,
  fallbackBrands,
}: {
  fallbackJob: RequestJob
  fallbackBrands: RequestBrand[]
}) {
  const [view, setView] = useState<RequestsView | null>(null)

  useEffect(() => {
    const board = readDemoBoard()
    if (!board) {
      setView({ job: fallbackJob, brands: fallbackBrands, demo: false, waiting: false })
      return
    }
    const review = readDemoReview()
    if (!review) {
      setView({ job: jobFromBoard(board), brands: [], demo: true, waiting: true })
      return
    }
    const approved = new Set(review.approved)
    const byBrand = new Map<string, RequestBrand>()
    for (const look of board.looks) {
      if (!approved.has(look.id)) continue
      const entry = byBrand.get(look.brand) ?? {
        brand: look.brand,
        contactEmail: contactFor(look.brand),
        looks: [],
      }
      entry.looks.push({ id: look.id, lookNo: look.lookNo, season: look.season, src: look.src })
      byBrand.set(look.brand, entry)
    }
    setView({ job: jobFromBoard(board), brands: [...byBrand.values()], demo: true, waiting: false })
    // The fallbacks are server-rendered once for this page; read the session once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!view) {
    return (
      <main className="mx-auto max-w-[1440px] px-6 py-16 md:px-10">
        <p className="text-[13px] text-muted-foreground">Opening the requests…</p>
      </main>
    )
  }

  const approvedLooks = view.brands.reduce((total, brand) => total + brand.looks.length, 0)

  return (
    <>
      {view.demo ? (
        <div className="border-b border-border bg-muted">
          <p className="mx-auto max-w-[1440px] px-6 py-2 text-[11px] tracking-[0.02em] text-muted-foreground md:px-10">
            {view.waiting ? (
              <>
                Waiting on the client — no approvals submitted yet.{" "}
                <Link href="/client" className="underline underline-offset-2">
                  Open the client page →
                </Link>
              </>
            ) : (
              <>
                From {view.job.client}&apos;s approvals — {approvedLooks} look
                {approvedLooks === 1 ? "" : "s"} across {view.brands.length} brand
                {view.brands.length === 1 ? "" : "s"}. Draft one email per house, then send.
              </>
            )}
          </p>
        </div>
      ) : null}
      <RequestEmails job={view.job} brands={view.brands} />
    </>
  )
}
