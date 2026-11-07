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
import { useMemo, useState } from "react"
import { Sparkles } from "lucide-react"
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

export function ReviewBoard({ looks, job, progress, onBack }: ReviewBoardProps) {
  const [added, setAdded] = useState<string[]>([])
  const [sendState, setSendState] = useState<"idle" | "needs-backend">("idle")

  const grouped = useMemo(() => groupByBrand(looks), [looks])
  const addedLooks = useMemo(() => looks.filter((l) => added.includes(l.id)), [looks, added])

  const toggleAdded = (id: string) =>
    setAdded((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]))

  return (
    <div role="dialog" aria-label="Review board" className="fixed inset-0 z-50 overflow-y-auto bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background">
        {/* Left: what the job is. Right: when it is due and where it goes. */}
        <div className="mx-auto flex max-w-[1180px] items-start gap-6 px-6 py-5">
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Review board</p>
            <h2 className="text-[clamp(30px,3.4vw,46px)] font-medium leading-[0.95] tracking-[-0.035em] text-foreground">
              {job.title.trim() || "Untitled job"}
            </h2>
            {job.description ? (
              <p className="text-[12px] uppercase tracking-[0.14em] text-muted-foreground">
                {job.description}
              </p>
            ) : null}
          </div>

          <div className="ml-auto flex items-start gap-3">
            <div className="flex flex-col items-end gap-1 text-right">
              {progress ? (
                <span role="status" className="text-[12px] text-muted-foreground">
                  {progress.done}/{progress.total} · {progress.label}
                </span>
              ) : null}
              <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                Due {formatDue(job.dueDate)}
              </span>
              <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                {job.email || "No contact email"}
              </span>
            </div>

            {/* Cart in the header: the count is always visible, the shortlist is one click away. */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="shrink-0">
                  Shortlist{added.length ? ` · ${added.length}` : ""}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[340px] p-4">
                <p className="text-[13px] text-muted-foreground">
                  {added.length === 0
                    ? "No looks added yet."
                    : `${added.length} look${added.length === 1 ? "" : "s"} added`}
                </p>
                {addedLooks.length ? (
                  <div className="mt-3 grid max-h-[220px] grid-cols-4 gap-2 overflow-y-auto">
                    {addedLooks.map((look) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={look.id}
                        src={look.src}
                        alt={`${look.brand} ${look.lookNo}`}
                        className="aspect-[3/4] w-full rounded border border-border object-cover"
                      />
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-[13px] text-muted-foreground">
                    Press Add on a look to shortlist it.
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

      <div className="mx-auto max-w-[1180px] px-6 pb-16 pt-10">
        {/* Sections breathe: a board is read house by house, not as one list. */}
        <div className="flex flex-col gap-20">
          {grouped.map(([brand, list]) => (
            <section key={brand} className="flex flex-col gap-4">
              <div className="flex items-baseline justify-between gap-4 border-b border-border pb-3">
                <h3 className="text-[20px] font-medium uppercase leading-none tracking-[0.14em] text-foreground">
                  {brand}
                </h3>
                <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  {list.length} look{list.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {list.map((look) => {
                  const isAdded = added.includes(look.id)
                  const ready = look.status === "ready" && look.src
                  return (
                    <figure
                      key={look.id}
                      className="flex flex-col gap-2"
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
                            ? "relative overflow-hidden rounded-md border border-brand ring-2 ring-brand"
                            : "relative overflow-hidden rounded-md border border-border"
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
                      </div>
                      <figcaption className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
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
                        <Button
                          size="sm"
                          variant={isAdded ? "secondary" : "outline"}
                          onClick={() => toggleAdded(look.id)}
                          disabled={!ready}
                          aria-pressed={isAdded}
                        >
                          {isAdded ? "Added" : "Add"}
                        </Button>
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
