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
import { useMemo, useState, type ReactNode } from "react"
import { Check, Plus, Sparkles, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
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

interface ReviewBoardProps {
  looks: Look[]
  job: BoardJob
  /** Live ingest progress; omitted on the static board. */
  progress?: { done: number; total: number; label: string } | null
  onBack?: () => void
  /**
   * `sheet` (default) is the hand-off from the start-job dialog: a fixed panel
   * that covers the page. `page` is the board opened directly at /board, where
   * it sits under the site header in app/(site)/layout.tsx and is not a dialog.
   */
  chrome?: "sheet" | "page"
  /** Rendered beside the client's name — the board switcher, on the static page. */
  switcher?: ReactNode
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
  progress,
  onBack,
  chrome = "sheet",
  switcher,
}: ReviewBoardProps) {
  const [added, setAdded] = useState<string[]>([])
  const [sendState, setSendState] = useState<"idle" | "needs-backend">("idle")

  // Removing is local to this surface — nothing is persisted, and the seeded
  // board should come back on reload.
  const [removed, setRemoved] = useState<string[]>([])
  const visible = useMemo(() => looks.filter((l) => !removed.includes(l.id)), [looks, removed])
  const grouped = useMemo(() => groupByBrand(visible), [visible])
  const addedLooks = useMemo(() => visible.filter((l) => added.includes(l.id)), [visible, added])

  const toggleAdded = (id: string) =>
    setAdded((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]))

  const removeLook = (id: string) => {
    setRemoved((current) => (current.includes(id) ? current : [...current, id]))
    setAdded((current) => current.filter((x) => x !== id))
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
    >
      <header className="sticky top-0 z-10 border-b border-border bg-background">
        {/* Left: what the job is. Right: when it is due and where it goes. */}
        <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-6 py-5 md:flex-row md:items-start md:gap-6 md:px-10">
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-[10px] tracking-[0.02em] text-muted-foreground">Review board</p>
            <div className="flex items-center gap-3">
              <h2 className="min-w-0 text-[clamp(30px,3.4vw,46px)] font-semibold leading-[0.95] tracking-[-0.035em] text-foreground">
                {job.description.trim() || job.title.trim() || "Untitled client"}
              </h2>
              {switcher ?? null}
            </div>
            {job.description.trim() && job.title ? (
              <p className="text-[12px] tracking-[0.02em] text-muted-foreground">{job.title}</p>
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
                {sendState === "needs-backend" ? (
                  <p role="status" className="mt-4 rounded-md border border-border bg-muted p-3 text-[12px] leading-snug text-foreground">
                    Held in the browser. Minting the client link and emailing it needs the database
                    connection, so nothing was sent.
                  </p>
                ) : (
                  <Button
                    className="mt-4 w-full"
                    disabled={added.length === 0}
                    onClick={() => setSendState("needs-backend")}
                  >
                    Send to client
                  </Button>
                )}
              </PopoverContent>
            </Popover>

            {onBack ? (
              <Button variant="ghost" onClick={onBack} className="shrink-0">
                Back
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1440px] px-6 pb-16 pt-10 md:px-10">
        {/* Sections breathe: a board is read house by house, not as one list. */}
        <div className="flex flex-col gap-20">
          {grouped.map(([brand, list]) => (
            <section key={brand} className="flex flex-col gap-4">
              <div className="flex items-baseline justify-between gap-4 border-b border-border pb-3">
                <h3 className="text-[20px] font-medium leading-none tracking-[0.02em] text-foreground">
                  {brand}
                </h3>
                <span className="text-[10px] tracking-[0.02em] text-muted-foreground">
                  {list.length} look{list.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="board-grid">
                {list.map((look) => {
                  const isAdded = added.includes(look.id)
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
                                onClick={() => removeLook(look.id)}
                                className="inline-flex size-7 items-center justify-center rounded-full border border-border bg-card text-foreground hover:border-foreground"
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
