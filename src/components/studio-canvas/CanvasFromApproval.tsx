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

import { cropPiece } from "./image-bits"

function jobSlug(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "look"
  )
}
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
  const [view, setView] = useState<{
    refs: Reference[]
    context?: string
    mode: "collage" | "render"
    filename?: string
  } | null>(null)

  useEffect(() => {
    let cancelled = false

    const build = async () => {
      const board = readDemoBoard()
      const review = readDemoReview()

      // What the client circled wins: each ring becomes a clean rectangular crop of that garment,
      // and the canvas collages the pieces as separates.
      if (board && review?.pieces?.length) {
        const byId = new Map(board.looks.map((look) => [look.id, look]))
        const refs: Reference[] = []
        for (const piece of review.pieces.slice(0, 4)) {
          const look = byId.get(piece.lookId)
          if (!look?.src) continue
          try {
            refs.push({
              name: `${look.brand} · look ${look.lookNo}`,
              image: await cropPiece(look.src, piece.box),
            })
          } catch {
            // An unreadable crop should not empty the whole composition.
          }
        }
        if (!cancelled && refs.length) {
          setView({
            refs,
            context: `${board.job.client}'s circled pieces`,
            mode: "collage",
            filename: `${jobSlug(board.job.title)}-collage.png`,
          })
          return
        }
      }

      // No circles: fall back to the approved looks and the image model, as before.
      if (board && review?.approved.length) {
        const approved = new Set(review.approved)
        const refs = board.looks
          .filter((look) => approved.has(look.id) && look.src)
          .slice(0, 4)
          .map((look) => ({ name: `${look.brand} · look ${look.lookNo}`, image: look.src }))
        if (!cancelled && refs.length) {
          const total = board.looks.filter((look) => approved.has(look.id) && look.src).length
          setView({
            refs,
            context: `${board.job.client}'s approved looks${total > refs.length ? ` · first ${refs.length} of ${total}` : ""}`,
            mode: "render",
            filename: `${jobSlug(board.job.title)}-look.png`,
          })
          return
        }
      }

      if (!cancelled) setView({ refs: fallbackRefs, mode: "render" })
    }

    void build()
    return () => {
      cancelled = true
    }
    // The fallbacks are server-rendered once; read the demo session once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!view) {
    return <p className="px-6 py-16 text-[13px] text-muted-foreground md:px-10">Framing the composition…</p>
  }

  return (
    <StudioCanvas
      refs={view.refs}
      sampleAssets={sampleAssets}
      context={view.context}
      mode={view.mode}
      filename={view.filename}
    />
  )
}
