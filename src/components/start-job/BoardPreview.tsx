"use client"

/**
 * The static board surface: several boards, one at a time.
 *
 * Each board is seeded, and switching is local state — this page is the design
 * surface, not the studio. `key` on the board resets its shortlist and removals
 * when you move to another job, so the two boards never bleed into each other.
 *
 * A deleted look is replaced from the reserve the server hands each board, so a
 * house keeps its five looks instead of thinning out. Once the reserve is spent
 * the five are a floor: the remove control is held rather than allowed below it.
 */
import { useMemo, useState } from "react"

import { MIN_PER_ROW, ReviewBoard, type BoardJob, type Look } from "./ReviewBoard"
import { BoardSwitcher, type BoardOption } from "./BoardSwitcher"

export interface PreviewBoard {
  id: string
  job: BoardJob
  looks: Look[]
  /** Looks of the same house this board has not shown yet, ready to backfill a removal. */
  reserve?: Record<string, Look[]>
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

  return <BoardSurface key={active.id} board={active} options={options} onSelect={setActiveId} />
}

function BoardSurface({
  board,
  options,
  onSelect,
}: {
  board: PreviewBoard
  options: BoardOption[]
  onSelect: (id: string) => void
}) {
  /** Replacements added during this visit — the seeded looks come back on reload. */
  const [added, setAdded] = useState<Look[]>([])
  const [reserve, setReserve] = useState<Record<string, Look[]>>(board.reserve ?? {})

  const looks = useMemo(() => [...board.looks, ...added], [board.looks, added])

  const refill = (removed: Look) => {
    const spare = reserve[removed.brand]?.[0]
    if (!spare) return
    setReserve((current) => ({
      ...current,
      [removed.brand]: (current[removed.brand] ?? []).slice(1),
    }))
    setAdded((current) => [...current, { ...spare, id: `${spare.id}:${Date.now()}` }])
  }

  /** A house keeps five: below that, a removal is only offered when a replacement exists. */
  const canRemove = (look: Look, rowCount: number) => {
    if (rowCount > MIN_PER_ROW) return true
    return (reserve[look.brand]?.length ?? 0) > 0
  }

  return (
    <ReviewBoard
      chrome="page"
      looks={looks}
      job={board.job}
      onRemoveLook={refill}
      canRemove={canRemove}
      switcher={<BoardSwitcher boards={options} currentId={board.id} onSelect={onSelect} />}
    />
  )
}
