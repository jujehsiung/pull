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
import { useMemo, useRef, useState } from "react"

import { describeTaste, nearestToTaste } from "@/lib/taste"
import { MIN_PER_ROW, ReviewBoard, type BoardJob, type Look } from "./ReviewBoard"
import { BoardSwitcher, type BoardOption } from "./BoardSwitcher"

/** The research route's shape, as much of it as the static board needs. */
interface SourceLook {
  lookNo: number
  image: string
}

interface SourceDesigner {
  brand: string
  slug: string
  season: string
  looks: SourceLook[]
  reserve: SourceLook[]
}

/** The route relays Vogue photos same-origin so the board's canvas crop stays readable. */
function imageSource(image: string): string {
  return `/api/skills/suggest-looks/image?u=${encodeURIComponent(image)}`
}

function lookFrom(designer: SourceDesigner, look: SourceLook): Look {
  return {
    id: `suggested:${designer.slug}:${look.lookNo}:${Date.now()}`,
    fileName: `${designer.slug}-look-${look.lookNo}.jpg`,
    brand: designer.brand,
    lookNo: look.lookNo,
    season: designer.season,
    suggested: true,
    source: imageSource(look.image),
    status: "ready",
    src: imageSource(look.image),
  }
}

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
  /** Replacements and freshly suggested houses added during this visit. */
  const [added, setAdded] = useState<Look[]>([])
  const [reserve, setReserve] = useState<Record<string, Look[]>>(board.reserve ?? {})
  const [suggesting, setSuggesting] = useState(false)
  const [suggestError, setSuggestError] = useState<string | null>(null)
  const [tasteNote, setTasteNote] = useState<string | null>(null)
  /** Where the next press continues in the season; the six seeded houses came first. */
  const offset = useRef(6)

  const looks = useMemo(() => [...board.looks, ...added], [board.looks, added])

  /**
   * Taste picks the replacement: it reads the row that is left and takes the look from the same
   * collection nearest to it, instead of the next one in the list.
   */
  const refill = (removed: Look, row: Look[]) => {
    const candidates = reserve[removed.brand] ?? []
    if (!candidates.length) return
    void (async () => {
      const kept = row.flatMap((look) => (look.src ? [{ id: look.id, src: look.src }] : []))
      const readable = candidates.flatMap((look, index) => (look.src ? [{ look, index }] : []))
      const slot = readable.length
        ? await nearestToTaste(
            kept,
            readable.map((entry) => ({ id: entry.look.id, src: entry.look.src as string })),
          )
        : 0
      const picked = readable[slot] ?? { look: candidates[0], index: 0 }
      setReserve((current) => ({
        ...current,
        [removed.brand]: (current[removed.brand] ?? []).filter((_, index) => index !== picked.index),
      }))
      setAdded((current) => [...current, { ...picked.look, id: `${picked.look.id}:${Date.now()}` }])
      if (picked.look.src) {
        setTasteNote(
          `look ${picked.look.lookNo} — ${await describeTaste(kept, {
            id: picked.look.id,
            src: picked.look.src,
          })}`,
        )
      }
    })()
  }

  /** A house keeps five: below that, a removal is only offered when a replacement exists. */
  const canRemove = (look: Look, rowCount: number) => {
    if (rowCount > MIN_PER_ROW) return true
    return (reserve[look.brand]?.length ?? 0) > 0
  }

  /**
   * More houses from the same season, pulled while the stylist is already selecting. A house the
   * board already carries is skipped, and a press that returns only known houses tries the next
   * slice once before saying the season is spent.
   */
  const suggestMore = async () => {
    if (suggesting) return
    setSuggesting(true)
    setSuggestError(null)
    const client = board.job.description.trim()
    try {
      const known = new Set(looks.map((look) => look.brand))
      let fresh: Look[] = []
      let extraReserve: Record<string, Look[]> = {}
      for (let attempt = 0; attempt < 2 && !fresh.length; attempt++) {
        const response = await fetch("/api/skills/suggest-looks", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ clientName: client, offset: offset.current, limit: 5 }),
        })
        const data = (await response.json()) as {
          designers?: SourceDesigner[]
          hasMore?: boolean
          error?: string
        }
        if (!response.ok) throw new Error(data.error ?? "The research run failed.")
        const designers = data.designers ?? []
        offset.current += designers.length
        fresh = designers
          .filter((designer) => !known.has(designer.brand))
          .flatMap((designer) => designer.looks.map((look) => lookFrom(designer, look)))
        for (const designer of designers) {
          if (known.has(designer.brand)) continue
          extraReserve[designer.brand] = designer.reserve.map((look) => lookFrom(designer, look))
        }
        if (!data.hasMore) break
      }
      if (!fresh.length) {
        setSuggestError("No new houses left in this season.")
        return
      }
      setReserve((current) => ({ ...current, ...extraReserve }))
      setAdded((current) => [...current, ...fresh])
    } catch (error) {
      setSuggestError(error instanceof Error ? error.message : "Could not load more houses.")
    } finally {
      setSuggesting(false)
    }
  }

  return (
    <ReviewBoard
      chrome="page"
      looks={looks}
      job={board.job}
      onRemoveLook={refill}
      canRemove={canRemove}
      onSuggest={() => void suggestMore()}
      suggesting={suggesting}
      suggestError={suggestError}
      tasteNote={tasteNote}
      switcher={<BoardSwitcher boards={options} currentId={board.id} onSelect={onSelect} />}
    />
  )
}
