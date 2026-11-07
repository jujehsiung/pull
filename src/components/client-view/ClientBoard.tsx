"use client"

/**
 * The client's page — the same board as the stylist's, with different verbs.
 *
 * The layout is deliberately the stylist's: hairline grid, client name in the
 * masthead, square thumbnails. Only the actions change, because the person
 * holding the link is deciding, not styling: approve or pass, and nothing is
 * deleted — a passed look stays on the board, dimmed, so both sides can see
 * what was turned down. Approve is the green mark; pass is ink.
 *
 * Static surface: decisions live in this page's state and nothing is sent.
 */
import { useMemo, useState } from "react"
import { Brush, Check, Eye, EyeOff, X } from "lucide-react"

import { ShareButton } from "./ShareButton"

import { Button } from "@/components/ui/button"
import type { Look } from "@/components/start-job/ReviewBoard"

import { LookMarkupDialog } from "./LookMarkupDialog"

export interface ClientBoardJob {
  /** The job, e.g. "Dune Tour". */
  title: string
  /** The person it is for. */
  client: string
  /** ISO yyyy-mm-dd. */
  dueDate: string
}

/** "2027-12-01" → "Dec 01 2027". */
function formatDue(iso: string): string {
  if (!iso) return "no due date"
  const date = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" })
}

function groupByBrand(looks: Look[]) {
  const map = new Map<string, Look[]>()
  for (const look of looks) {
    const list = map.get(look.brand) ?? []
    list.push(look)
    map.set(look.brand, list)
  }
  return [...map.entries()]
}

export function ClientBoard({ job, looks }: { job: ClientBoardJob; looks: Look[] }) {
  const [approved, setApproved] = useState<string[]>([])
  const [passed, setPassed] = useState<string[]>([])
  const [sent, setSent] = useState(false)
  /** Circled pieces, one PNG data URL per look id. Design surface: local only. */
  const [markups, setMarkups] = useState<Record<string, string>>({})
  const [markupLook, setMarkupLook] = useState<Look | null>(null)
  /** One switch for every markup layer: the eye in the page bar. */
  const [markupVisible, setMarkupVisible] = useState(true)

  const grouped = useMemo(() => groupByBrand(looks), [looks])
  const remaining = looks.length - approved.length - passed.length

  // A pick is exclusive: approving a passed look moves it, and clicking the
  // current decision again clears it.
  const approve = (id: string) => {
    setSent(false)
    setPassed((current) => current.filter((x) => x !== id))
    setApproved((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]))
  }
  const saveMarkup = (dataUrl: string | null) => {
    const id = markupLook?.id
    setMarkupLook(null)
    if (!id) return

    if (!dataUrl) {
      // Cleared: drop the markup, keep whatever decision the look already had.
      setMarkups((current) => {
        const next = { ...current }
        delete next[id]
        return next
      })
      return
    }

    setMarkups((current) => ({ ...current, [id]: dataUrl }))
    setSent(false)
    setPassed((current) => current.filter((x) => x !== id))
    setApproved((current) => (current.includes(id) ? current : [...current, id]))
  }

  const pass = (id: string) => {
    setSent(false)
    setApproved((current) => current.filter((x) => x !== id))
    setPassed((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]))
  }

  const markupCount = Object.keys(markups).length

  return (
    <div className="relative bg-background">
      <div className="border-b border-border">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between px-6 py-3 md:px-10">
          <span className="text-[19px] font-extrabold tracking-[0.01em] text-foreground">
            Pull.
          </span>
          <div className="flex items-center gap-3">
            {markupCount ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMarkupVisible((visible) => !visible)}
                aria-pressed={!markupVisible}
                aria-label={markupVisible ? "Hide all markup" : "Show all markup"}
              >
                {markupVisible ? (
                  <Eye className="size-3.5" aria-hidden />
                ) : (
                  <EyeOff className="size-3.5" aria-hidden />
                )}
                Markup
              </Button>
            ) : null}
            <span className="hidden text-[11px] tracking-[0.02em] text-muted-foreground sm:inline">
              Private link
            </span>
            <ShareButton
              title="Your PULL lookbook"
              text="The looks Juje pulled for Dune Tour — approve what you love, pass the rest."
            />
          </div>
        </div>
      </div>
      <header className="sticky top-0 z-10 border-b border-border bg-background">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-6 py-5 md:flex-row md:items-start md:gap-6 md:px-10">
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-[10px] tracking-[0.02em] text-muted-foreground">Your looks</p>
            <h1 className="min-w-0 text-[clamp(30px,3.4vw,46px)] font-semibold leading-[0.95] tracking-[-0.035em] text-foreground">
              {job.client}
            </h1>
            <p className="text-[12px] tracking-[0.02em] text-muted-foreground">
              {job.title} · Due {formatDue(job.dueDate)}
            </p>
            <p className="mt-1 text-[11px] tracking-[0.02em] text-muted-foreground">
              Approve what you love, pass the rest.
            </p>
          </div>

          <div className="flex items-start justify-between gap-3 md:ml-auto md:justify-end">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 md:flex-col md:items-end md:gap-2">
              <span className="text-[11px] tracking-[0.02em] text-muted-foreground">
                <b className="font-medium text-foreground">{approved.length}</b> approved ·{" "}
                <b className="font-medium text-foreground">{passed.length}</b> passed ·{" "}
                <b className="font-medium text-foreground">{remaining}</b> to review
              </span>
              {sent ? (
                <span className="text-[12px] text-success">Sent to your stylist</span>
              ) : (
                <Button onClick={() => setSent(true)} disabled={approved.length === 0}>
                  Send approvals
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1440px] px-6 pb-16 pt-10 md:px-10">
        <div className="flex flex-col gap-20">
          {grouped.map(([brand, list]) => (
            <section key={brand} className="flex flex-col gap-4">
              <div className="flex items-baseline justify-between gap-4 border-b border-border pb-3">
                <h2 className="text-[20px] font-medium leading-none tracking-[0.02em] text-foreground">
                  {brand}
                </h2>
                <span className="text-[10px] tracking-[0.02em] text-muted-foreground">
                  {list.length} look{list.length === 1 ? "" : "s"}
                </span>
              </div>

              <div className="board-grid">
                {list.map((look) => {
                  const isApproved = approved.includes(look.id)
                  const isPassed = passed.includes(look.id)
                  return (
                    <figure key={look.id} className="group relative flex flex-col bg-background">
                      <div
                        className={
                          isApproved
                            ? "relative overflow-hidden outline outline-1 -outline-offset-1 outline-success"
                            : "relative overflow-hidden"
                        }
                      >
                        {look.src ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={look.src}
                            alt={`${look.brand} look ${look.lookNo}`}
                            className={`aspect-[3/4] w-full object-cover transition-opacity ${
                              isPassed ? "opacity-40" : ""
                            }`}
                          />
                        ) : null}

                        {/* The rings themselves, as a layer over the thumbnail. */}
                        {markups[look.id] && markupVisible ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={markups[look.id]}
                            alt=""
                            aria-hidden
                            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                          />
                        ) : null}

                        {/* Decided looks keep their mark when the pointer is away. */}
                        {isApproved || isPassed ? (
                          <button
                            type="button"
                            aria-label={isApproved ? "Approved — undo" : "Passed — undo"}
                            onClick={() => (isApproved ? approve(look.id) : pass(look.id))}
                            className={`tile-marker inline-flex size-7 items-center justify-center rounded-full border border-transparent ${
                              isApproved
                                ? "bg-success text-success-foreground"
                                : "bg-foreground text-background"
                            }`}
                          >
                            {isApproved ? (
                              <Check className="size-3.5" aria-hidden />
                            ) : (
                              <X className="size-3.5" aria-hidden />
                            )}
                          </button>
                        ) : null}

                        {/* Hover (or touch) reveals both decisions, with the taken one filled. */}
                        <div className="tile-actions absolute right-2 top-2 flex items-center gap-1.5">
                          <button
                            type="button"
                            aria-label={`Approve look ${look.lookNo}`}
                            aria-pressed={isApproved}
                            onClick={() => approve(look.id)}
                            className={
                              isApproved
                                ? "inline-flex size-7 items-center justify-center rounded-full border border-transparent bg-success text-success-foreground"
                                : "inline-flex size-7 items-center justify-center rounded-full border border-border bg-card text-foreground hover:border-foreground"
                            }
                          >
                            <Check className="size-3.5" aria-hidden />
                          </button>
                          <button
                            type="button"
                            aria-label={`Mark up pieces in look ${look.lookNo}`}
                            aria-pressed={Boolean(markups[look.id])}
                            onClick={() => setMarkupLook(look)}
                            className={
                              markups[look.id]
                                ? "inline-flex size-7 items-center justify-center rounded-full border border-border bg-card text-foreground ring-1 ring-foreground"
                                : "inline-flex size-7 items-center justify-center rounded-full border border-border bg-card text-foreground hover:border-foreground"
                            }
                          >
                            <Brush className="size-3.5" aria-hidden />
                          </button>
                          <button
                            type="button"
                            aria-label={`Pass look ${look.lookNo}`}
                            aria-pressed={isPassed}
                            onClick={() => pass(look.id)}
                            className={
                              isPassed
                                ? "inline-flex size-7 items-center justify-center rounded-full border border-transparent bg-foreground text-background"
                                : "inline-flex size-7 items-center justify-center rounded-full border border-border bg-card text-foreground hover:border-foreground"
                            }
                          >
                            <X className="size-3.5" aria-hidden />
                          </button>
                        </div>
                      </div>

                      <figcaption className="flex items-center justify-between gap-2 px-2 py-2">
                        <span className="text-[10px] tracking-[0.02em] text-muted-foreground">
                          Look {look.lookNo}
                          {look.season ? ` · ${look.season}` : ""}
                        </span>
                        {isApproved ? (
                          <span className="inline-flex items-center gap-1.5 text-[10px] tracking-[0.02em] text-success">
                            <Brush
                              className={markups[look.id] ? "size-3" : "hidden"}
                              aria-label={markups[look.id] ? "Pieces circled" : undefined}
                              role="img"
                            />
                            Approved
                          </span>
                        ) : isPassed ? (
                          <span className="text-[10px] tracking-[0.02em] text-muted-foreground">Passed</span>
                        ) : null}
                      </figcaption>
                    </figure>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      </div>

      <LookMarkupDialog
        look={markupLook}
        initial={markupLook ? markups[markupLook.id] : null}
        onClose={() => setMarkupLook(null)}
        onSave={saveMarkup}
      />
    </div>
  )
}
