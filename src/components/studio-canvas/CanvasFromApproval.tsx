"use client"

/**
 * The compose canvas, opened after the client's approval.
 *
 * When this tab holds a reviewed shortlist, the approved looks become the four references: the
 * studio is already wired for exactly that (references → compose → save), so the stylist can mark
 * the pieces and have the assistant combine them into one mockup. With no approval in the tab it
 * falls back to the seeded reference set, so the page is still reviewable on a cold load.
 */
import { useEffect, useState } from "react"

import { readDemoBoard, readDemoReview } from "@/lib/demo-session"

import { StudioCanvas } from "./StudioCanvas"

interface Reference {
  name: string
  image: string
}

export function CanvasFromApproval({
  fallbackRefs,
  sampleAssets,
}: {
  fallbackRefs: Reference[]
  sampleAssets: string[]
}) {
  const [view, setView] = useState<{ refs: Reference[]; context?: string } | null>(null)

  useEffect(() => {
    const board = readDemoBoard()
    const review = readDemoReview()
    if (board && review?.approved.length) {
      const approved = new Set(review.approved)
      const refs = board.looks
        .filter((look) => approved.has(look.id) && look.src)
        .slice(0, 4)
        .map((look) => ({ name: `${look.brand} · look ${look.lookNo}`, image: look.src }))
      if (refs.length) {
        const total = board.looks.filter((look) => approved.has(look.id) && look.src).length
        setView({
          refs,
          context: `${board.job.client}'s approved looks${total > refs.length ? ` · first ${refs.length} of ${total}` : ""}`,
        })
        return
      }
    }
    setView({ refs: fallbackRefs })
    // The fallbacks are server-rendered once; read the demo session once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!view) {
    return <p className="px-6 py-16 text-[13px] text-muted-foreground md:px-10">Framing the composition…</p>
  }

  return <StudioCanvas refs={view.refs} sampleAssets={sampleAssets} context={view.context} />
}
