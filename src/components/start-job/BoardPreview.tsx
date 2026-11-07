"use client"

/**
 * The static board surface: several boards, one at a time.
 *
 * Each board is seeded, and switching is local state — this page is the design
 * surface, not the studio. `key` on the board resets its shortlist and removals
 * when you move to another job, so the two boards never bleed into each other.
 */
import { useState } from "react"

import { ReviewBoard, type BoardJob, type Look } from "./ReviewBoard"
import { BoardSwitcher, type BoardOption } from "./BoardSwitcher"

export interface PreviewBoard {
  id: string
  job: BoardJob
  looks: Look[]
}

export function BoardPreview({ boards }: { boards: PreviewBoard[] }) {
  const [activeId, setActiveId] = useState(boards[0]?.id ?? "")
  const active = boards.find((board) => board.id === activeId) ?? boards[0]

  if (!active) return null

  const options: BoardOption[] = boards.map((board) => ({
    id: board.id,
    title: board.job.title,
    client: board.job.description,
    looks: board.looks.length,
  }))

  return (
    <ReviewBoard
      key={active.id}
      chrome="page"
      looks={active.looks}
      job={active.job}
      switcher={
        <BoardSwitcher boards={options} currentId={active.id} onSelect={setActiveId} />
      }
    />
  )
}
