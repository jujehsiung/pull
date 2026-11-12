"use client"

/**
 * The review board — job header, looks grouped by house, and the shortlist rail.
 *
 * Extracted from the start-job flow so the same board can be opened directly at
 * /board with seeded looks, which is how it gets iterated on: no dialog, no
 * folder, no processing wait.
 *
 * Type: one typeface throughout, per Juje. No mono.
 */
import { useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react"
import { Check, Plus, RotateCcw, Sparkles, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { readBoardTaste, type TasteTraits } from "@/lib/taste"
import type { IngestStep } from "./ingest"

export type LookStatus = "queued" | "cropping" | "reading" | "ready" | "error"

export interface Look {
  id: string
  fileName: string
  brand: string
  lookNo: number
  season: string | null
  suggested: boolean
  source: File | string
  known?: { brand: string; lookNo: number; season: string | null }
  status: LookStatus
  src?: string
  steps?: IngestStep[]
}

/**
 * The floor a house keeps: with stock left in its collection every removal is replaced, and once the
 * stock is spent the row may not be taken below five. A house that starts under five is not held —
 * five is a target, not a thing to invent looks for.
 */
export const MIN_PER_ROW = 5

/**
 * Ids for a suggested look. `Date.now()` looked unique but two looks added in the same millisecond —
 * a designer's shown and reserve lists are read in one tick — collided, which React reports as a
 * duplicate key. A counter is cheap and cannot repeat.
 */
let suggestionSeq = 0
export function suggestionId(slug: string, lookNo: number): string {
  suggestionSeq += 1
  return `suggested:${slug}:${lookNo}:${suggestionSeq}`
}

export interface BoardJob {
  title: string
  description: string
  email: string
  /** ISO yyyy-mm-dd. */
  dueDate: string
}

/** "2027-12-01" → "Dec 01 2027". The board never shows a raw ISO date. */
function formatDue(iso: string): string {
  if (!iso) return "no due date"
  const date = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" })
}

/**
 * A layout effect that is honest on the server too: the sheet only mounts in the browser, but the
 * board it renders is part of the SSR HTML when a stored board is restored, so the server pass must
 * not warn about `useLayoutEffect`.
 */
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect

/**
 * The sheet sits below the site chrome rather than over it.
 *
 * The demo guide (board / approval / intake) and the site header are the chrome that has to survive
 * every screen, and a `fixed inset-0` panel covered both. Measuring the chrome's bottom and starting
 * the sheet there keeps the real guide and header on screen — the same top the board has at `/board`
 * — and pinning the page underneath stops the chrome scrolling away while the board is open.
 */
function useSheetChromeTop(enabled: boolean): number {
  const [top, setTop] = useState(0)

  useIsomorphicLayoutEffect(() => {
    if (!enabled) return
    const guide = document.querySelector(".demo-guide")
    const header = document.querySelector("[data-site-header]")
    const measure = () => {
      const guideBottom = guide?.getBoundingClientRect().bottom ?? 0
      const headerBottom = header?.getBoundingClientRect().bottom ?? 0
      setTop(Math.round(Math.max(0, guideBottom, headerBottom)))
    }

    // The chrome sits in the page flow, so it is only readable (and only visible above the sheet)
    // from scroll zero. Pin the page there while the sheet is open — the sheet is its own scroll
    // container. A scroll listener catches the start-job dialog's own scroll lock, which restores
    // the previous scroll position when it unmounts, after this effect has already run.
    const pin = () => {
      if (window.scrollY !== 0) window.scrollTo(0, 0)
      measure()
    }

    pin()
    document.body.classList.add("sheet-scroll-lock")
    window.addEventListener("resize", pin)
    window.addEventListener("scroll", pin, { passive: true })
    // The dialog's restore lands after the commit: run once more on the next frame and after it.
    const frame = requestAnimationFrame(pin)
    const timer = window.setTimeout(pin, 150)

    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(timer)
      window.removeEventListener("resize", pin)
      window.removeEventListener("scroll", pin)
      document.body.classList.remove("sheet-scroll-lock")
    }
  }, [enabled])

  return top
}

interface ReviewBoardProps {
  looks: Look[]
  job: BoardJob
  /** The occasion the board was researched for, shown beside "Review board". */
  brief?: string
  /** Live ingest progress; omitted on the static board. */
  progress?: { done: number; total: number; label: string } | null
  onBack?: () => void
  /**
   * Called after a look is removed, with the row it left behind, so the owner can pick a
   * replacement from the same collection — the Taste skill reads that row.
   */
  onRemoveLook?: (look: Look, row: Look[]) => void
  /**
   * Whether a look may be removed. The parent owns the reserve, so it decides: with stock left a
   * removal is always replaced; at the floor with none, the control is held.
   */
  canRemove?: (look: Look, rowCount: number) => boolean
  /**
   * `sheet` (default) is the hand-off from the start-job dialog: a fixed panel
   * that covers the page. `page` is the board opened directly at /board, where
   * it sits under the site header in app/(site)/layout.tsx and is not a dialog.
   */
  chrome?: "sheet" | "page"
  /** Rendered beside the client's name — the board switcher, on the static page. */
  switcher?: ReactNode
  /** The agent's next move on a live board: pull more houses while the stylist is selecting. */
  onSuggest?: () => void
  suggesting?: boolean
  suggestError?: string | null
  /** One line from the Taste skill: which look it picked and why. */
  tasteNote?: string | null
  /** Re-pick every house from its collection against the pattern the chips read. */
  onReseed?: () => void
  reseeding?: boolean
}

/** One direction of the Taste read — colour, texture or shape — as a labelled chip group. */
function ChipGroup({ label, values }: { label: string; values: string[] }) {
  if (!values.length) return null
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="text-[10px] tracking-[0.02em] text-muted-foreground-soft">{label}</span>
      {values.map((value) => (
        <span
          key={value}
          className="rounded-full border border-border bg-card px-2.5 py-0.5 text-[11px] leading-5 text-foreground"
        >
          {value}
        </span>
      ))}
    </span>
  )
}

function groupByBrand(looks: Look[]) {
  const map = new Map<string, Look[]>()
  for (const look of looks) {
    const list = map.get(look.brand) ?? []
    list.push(look)
    map.set(look.brand, list)
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([brand, list]) => [brand, list.sort((x, y) => x.lookNo - y.lookNo)] as const)
}

export function ReviewBoard({
  looks,
  job,
  brief,
  progress,
  onBack,
  onRemoveLook,
  canRemove,
  chrome = "sheet",
  switcher,
  onSuggest,
  suggesting = false,
  suggestError,
  tasteNote,
  onReseed,
  reseeding = false,
}: ReviewBoardProps) {
  const [added, setAdded] = useState<string[]>([])
  const [sendState, setSendState] = useState<"idle" | "needs-backend">("idle")
  /** Where the sheet starts: below the demo guide and site header, so they stay on screen. */
  const sheetTop = useSheetChromeTop(chrome === "sheet")

  // Removing is a soft delete: the look leaves the board but stays in the bin until it is
  // restored. Nothing is persisted, so the seeded board comes back on reload.
  const [removed, setRemoved] = useState<Look[]>([])
  const removedIds = useMemo(() => new Set(removed.map((look) => look.id)), [removed])
  const visible = useMemo(() => {
    // One house cannot show the same look twice. Two runs can hand back the same look under
    // different ids (a re-press, a reserve that overlapped), so the board is unambiguous here
    // even when the data is not.
    const seen = new Set<string>()
    return looks.filter((look) => {
      if (removedIds.has(look.id)) return false
      const key = `${look.brand}|${look.lookNo}|${look.season ?? ""}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [looks, removedIds])
  const grouped = useMemo(() => groupByBrand(visible), [visible])
  const addedLooks = useMemo(() => visible.filter((l) => added.includes(l.id)), [visible, added])

  // The pattern across the board, read in the browser and shown as chips under the title. It
  // follows the pictures that are still on the board, so a delete shifts what the board reads as.
  const [chips, setChips] = useState<TasteTraits | null>(null)
  /** The house the stylist last worked in: the chips read that row, not the whole board. */
  const [focus, setFocus] = useState<string | null>(null)
  const tasteSources = useMemo(
    () =>
      visible
        .filter((look) => !focus || look.brand === focus)
        .flatMap((look) => (look.src ? [look.src] : [])),
    [visible, focus],
  )
  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => {
      void readBoardTaste(tasteSources).then((traits) => {
        if (!cancelled) setChips(traits)
      })
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [tasteSources])

  const toggleAdded = (id: string) =>
    setAdded((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]))

  const removeLook = (look: Look) => {
    setFocus(look.brand)
    const row = visible.filter((entry) => entry.brand === look.brand && entry.id !== look.id)
    setRemoved((current) => (current.some((entry) => entry.id === look.id) ? current : [...current, look]))
    setAdded((current) => current.filter((x) => x !== look.id))
    onRemoveLook?.(look, row)
  }

  const restoreLook = (look: Look) =>
    setRemoved((current) => current.filter((entry) => entry.id !== look.id))

  /** Remove a house from the board: every look goes to the bin, so the house can come back. */
  const removeBrand = (brand: string, row: Look[]) => {
    // If the chips were reading this house, they fall back to the board rather than vanishing.
    setFocus((current) => (current === brand ? null : current))
    setRemoved((current) => {
      const ids = new Set(current.map((entry) => entry.id))
      return [...current, ...row.filter((look) => !ids.has(look.id))]
    })
  }

  return (
    <div
      role={chrome === "sheet" ? "dialog" : "region"}
      aria-label="Review board"
      className={
        chrome === "sheet"
          ? "fixed inset-0 z-50 overflow-y-auto bg-background"
          : "relative bg-background"
      }
      style={chrome === "sheet" ? { top: sheetTop } : undefined}
    >
      <header className="sticky top-0 z-10 border-b border-border bg-background">
        {/* Left: what the job is. Right: when it is due and where it goes. */}
        <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-6 py-5 md:flex-row md:items-start md:gap-6 md:px-10">
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-[10px] tracking-[0.02em] text-muted-foreground">
              Review board{brief ? ` · ${brief}` : ""}
            </p>
            <div className="flex items-center gap-3">
              <h2 className="min-w-0 text-[clamp(30px,3.4vw,46px)] font-semibold leading-[0.95] tracking-[-0.035em] text-foreground">
                {job.description.trim() || job.title.trim() || "Untitled client"}
              </h2>
              {switcher ?? null}
            </div>
            {job.description.trim() && job.title ? (
              <p className="text-[12px] tracking-[0.02em] text-muted-foreground">{job.title}</p>
            ) : null}
            {suggestError ? (
              <p role="status" className="text-[11px] text-[var(--destructive)]">
                {suggestError}
              </p>
            ) : null}
            {tasteNote ? (
              <p role="status" className="text-[11px] text-muted-foreground">
                <span className="text-brand">Taste</span> · {tasteNote}
              </p>
            ) : null}
          </div>

          <div className="flex items-start justify-between gap-3 md:ml-auto md:justify-end">
            <div className="flex flex-col gap-1 text-left md:items-end md:text-right">
              {progress ? (
                <span role="status" className="text-[12px] text-muted-foreground">
                  {progress.done}/{progress.total} · {progress.label}
                </span>
              ) : null}
              <span className="text-[11px] tracking-[0.02em] text-muted-foreground">
                Due {formatDue(job.dueDate)}
              </span>
              <span className="text-[11px] tracking-[0.02em] text-muted-foreground">
                {job.email || "No contact email"}
              </span>
            </div>

            {onSuggest ? (
              <Button
                variant="ghost"
                className="agent-action shrink-0"
                onClick={onSuggest}
                disabled={suggesting}
              >
                <Sparkles className="size-4" aria-hidden />
                {suggesting ? "Finding more looks…" : "Find more looks"}
              </Button>
            ) : null}

            {/* The bin: deleting a look is soft, so anything removed can come back. */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  disabled={removed.length === 0}
                  aria-label={
                    removed.length
                      ? `Deleted looks, ${removed.length} to restore`
                      : "Deleted looks, none"
                  }
                >
                  <Trash2 className="size-3.5" aria-hidden />
                  Deleted
                  {removed.length ? (
                    <span className="font-mono text-[10px] text-muted-foreground">{removed.length}</span>
                  ) : null}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[380px] p-4">
                <p className="text-[13px] text-muted-foreground">
                  {removed.length === 0
                    ? "Nothing deleted yet."
                    : `${removed.length} look${removed.length === 1 ? "" : "s"} deleted — restore any of them.`}
                </p>
                {removed.length ? (
                  <ul className="mt-3 flex max-h-[320px] flex-col gap-2 overflow-y-auto">
                    {removed.map((look) => (
                      <li key={look.id} className="flex items-center gap-3">
                        {look.src ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={look.src}
                            alt={`${look.brand} look ${look.lookNo}`}
                            className="aspect-[3/4] w-9 shrink-0 border border-border object-cover"
                          />
                        ) : (
                          <span className="aspect-[3/4] w-9 shrink-0 border border-border bg-muted" />
                        )}
                        <span className="min-w-0 flex-1 text-[12px] leading-snug text-foreground">
                          {look.brand}
                          <span className="text-muted-foreground"> · Look {look.lookNo}</span>
                        </span>
                        <Button variant="outline" size="sm" onClick={() => restoreLook(look)}>
                          <RotateCcw className="size-3.5" aria-hidden />
                          Restore
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {removed.length > 1 ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-3 w-full"
                    onClick={() => setRemoved([])}
                  >
                    Restore all
                  </Button>
                ) : null}
              </PopoverContent>
            </Popover>

            {/* Cart in the header: the count is always visible, the shortlist is one click away. */}
            <Popover>
              <PopoverTrigger asChild>
                {/* The count is a black square the button's own height, butted
                    against its right edge: a split control, not a floating badge. */}
                <div className="flex shrink-0 items-stretch">
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    aria-label={
                      added.length
                        ? `Shortlist, ${added.length} look${added.length === 1 ? "" : "s"}`
                        : "Shortlist"
                    }
                  >
                    Shortlist
                  </Button>
                  {added.length ? (
                    <span
                      aria-hidden="true"
                      className="inline-flex h-7 min-w-7 items-center justify-center bg-success px-1 text-[11px] font-medium leading-none text-success-foreground"
                    >
                      {added.length}
                    </span>
                  ) : null}
                </div>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[340px] p-4">
                <p className="text-[13px] text-muted-foreground">
                  {added.length === 0
                    ? "No looks added yet."
                    : `${added.length} look${added.length === 1 ? "" : "s"} added`}
                </p>
                {addedLooks.length ? (
                  <div className="shortlist-thumbs mt-3 overflow-y-auto">
                    {addedLooks.map((look) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={look.id}
                        src={look.src}
                        alt={`${look.brand} ${look.lookNo}`}
                        className="aspect-[3/4] w-full rounded-md border border-border object-cover"
                      />
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-[13px] text-muted-foreground">
                    Hover a look and press + to shortlist it.
                  </p>
                )}
                {/* The action stays: pressing it explains why nothing can be minted here, it does
                    not consume the control. */}
                <Button
                  className="mt-4 w-full"
                  disabled={added.length === 0}
                  onClick={() => setSendState("needs-backend")}
                >
                  Send to client
                </Button>
                {sendState === "needs-backend" ? (
                  <p role="status" className="mt-3 rounded-md border border-border bg-muted p-3 text-[12px] leading-snug text-foreground">
                    Held in the browser. Minting the client link and emailing it needs the database
                    connection, so nothing was sent.
                  </p>
                ) : null}
              </PopoverContent>
            </Popover>

            {onBack ? (
              <Button variant="ghost" onClick={onBack} className="shrink-0">
                Back
              </Button>
            ) : null}
          </div>
        </div>

        {chips ? (
          <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-6 gap-y-2 px-6 pb-4 md:px-10">
            <span className="text-[10px] tracking-[0.02em] text-muted-foreground">
              Taste · {focus ?? "the board"}
            </span>
            <ChipGroup label="colour" values={chips.color} />
            <ChipGroup label="texture" values={chips.texture} />
            <ChipGroup label="shape" values={chips.shape} />
            {onReseed ? (
              <Button
                variant="outline"
                size="sm"
                className="ml-auto shrink-0"
                onClick={onReseed}
                disabled={reseeding}
              >
                <Sparkles className="size-3.5" aria-hidden />
                {reseeding ? "Reseeding…" : "Reseed from taste"}
              </Button>
            ) : null}
          </div>
        ) : null}
      </header>

      <div className="mx-auto max-w-[1440px] px-6 pb-16 pt-10 md:px-10">
        {/* Sections breathe: a board is read house by house, not as one list. */}
        <div className="flex flex-col gap-20">
          {grouped.map(([brand, list]) => (
            <section key={brand} className="flex flex-col gap-4">
              <div className="flex items-baseline justify-between gap-4 border-b border-border pb-3">
                <div className="group flex min-w-0 items-baseline gap-2">
                  <h3 className="text-[20px] font-medium leading-none tracking-[0.02em] text-foreground">
                    {brand}
                  </h3>
                  {/* Hovering the house offers to take it off the board; the looks go to the bin. */}
                  <button
                    type="button"
                    aria-label={`Remove ${brand} from the board`}
                    title={`Remove ${brand} from the board`}
                    onClick={() => removeBrand(brand, list)}
                    className="inline-flex size-6 shrink-0 items-center justify-center text-muted-foreground-soft opacity-0 transition-opacity hover:text-[var(--destructive)] focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring group-hover:opacity-100"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </button>
                </div>
                <span className="text-[10px] tracking-[0.02em] text-muted-foreground">
                  {list.length} look{list.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="board-grid">
                {list.map((look) => {
                  const isAdded = added.includes(look.id)
                  const held = canRemove ? !canRemove(look, list.length) : false
                  const ready = look.status === "ready" && look.src
                  return (
                    <figure
                      key={look.id}
                      className="group relative flex flex-col bg-background"
                      title={
                        look.steps?.length
                          ? look.steps
                              .map(
                                (step) =>
                                  `${step.tool} · ${step.ms}ms · ${step.status}${step.note ? ` — ${step.note}` : ""}`,
                              )
                              .join("\n")
                          : undefined
                      }
                    >
                      <div
                        className={
                          isAdded
                            ? "relative overflow-hidden outline outline-1 -outline-offset-1 outline-brand"
                            : "relative overflow-hidden"
                        }
                      >
                        {ready ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={look.src}
                            alt={`${look.brand} look ${look.lookNo}`}
                            className="aspect-[3/4] w-full object-cover"
                          />
                        ) : look.status === "error" ? (
                          <div className="flex aspect-[3/4] w-full items-center justify-center p-3 text-center text-[12px] text-[var(--destructive)]">
                            This image could not be opened.
                          </div>
                        ) : (
                          <>
                            <Skeleton className="aspect-[3/4] w-full rounded-none" />
                            <span className="absolute inset-x-2 bottom-2 text-[11px] text-muted-foreground">
                              {look.status === "queued" ? "queued" : "cropping"}
                            </span>
                          </>
                        )}

                        {/* Shortlisted is a state, so the green check stays put.
                            Adding and dropping are gestures, so they show on hover. */}
                        {ready ? (
                          isAdded ? (
                            <button
                              type="button"
                              aria-label="Remove from shortlist"
                              aria-pressed="true"
                              onClick={() => toggleAdded(look.id)}
                              className="absolute right-2 top-2 inline-flex size-7 items-center justify-center rounded-full border border-transparent bg-success text-success-foreground"
                            >
                              <Check className="size-3.5" aria-hidden />
                            </button>
                          ) : (
                            <div className="tile-actions absolute right-2 top-2 flex items-center gap-1.5">
                              <button
                                type="button"
                                aria-label="Add to shortlist"
                                aria-pressed="false"
                                onClick={() => toggleAdded(look.id)}
                                className="inline-flex size-7 items-center justify-center rounded-full border border-border bg-card text-foreground hover:border-foreground"
                              >
                                <Plus className="size-3.5" aria-hidden />
                              </button>
                              <button
                                type="button"
                                aria-label={`Remove look ${look.lookNo} from the board`}
                                onClick={() => removeLook(look)}
                                disabled={held}
                                title={
                                  held
                                    ? "This collection has no more looks — five is the minimum for a house."
                                    : undefined
                                }
                                className="inline-flex size-7 items-center justify-center rounded-full border border-border bg-card text-foreground hover:border-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border"
                              >
                                <X className="size-3.5" aria-hidden />
                              </button>
                            </div>
                          )
                        ) : null}
                      </div>
                      <figcaption className="flex items-center justify-between gap-2 px-2 py-2">
                        <span className="inline-flex items-center gap-1.5 text-[10px] tracking-[0.02em] text-muted-foreground">
                          Look {look.lookNo}
                          {look.season ? ` · ${look.season}` : ""}
                          {look.suggested ? (
                            <Sparkles
                              className="size-3 text-brand"
                              aria-label="Suggested"
                              role="img"
                            />
                          ) : null}
                        </span>
                      </figcaption>
                    </figure>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      </div>

    </div>
  )
}
