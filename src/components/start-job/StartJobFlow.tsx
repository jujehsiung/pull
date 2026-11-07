"use client"

/**
 * Start a job — the dialog, then the board.
 *
 * The board itself lives in ./ReviewBoard because it is also served directly at
 * /board for iteration, without filling in the dialog each time.
 *
 * PROTOTYPE SCOPE: every look is really trimmed, cropped and read in the browser
 * (./ingest.ts). Persistence is not wired — the board is held in memory and
 * "Send to client" says so.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Sparkles } from "lucide-react"
import { parseLook } from "@/lib/agent/parse"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { AgentTrace } from "@/components/AgentTrace"
import type { AgentStep } from "@/lib/agent/trace"
import { ingestLook } from "./ingest"
import { MIN_PER_ROW, ReviewBoard, type Look } from "./ReviewBoard"

/** One look as the research route returns it: a Vogue Runway photograph + its look number. */
interface ApiLook {
  lookNo: number
  image: string
}

interface ApiDesigner {
  brand: string
  slug: string
  season: string
  collectionUrl: string
  slideshowUrl: string
  looks: ApiLook[]
  reserve: ApiLook[]
}

type SuggestStep = AgentStep

/**
 * Every run opens with the same three ids (`suggest.search`, `suggest.season`, `suggest.pick`), so a
 * second press — "Add 5 more designers", the board's own Suggest looks — would repeat a key the trace
 * list is already rendering. A repeated id is kept, but named as a later call: `suggest.search#2`.
 */
function appendStep(current: SuggestStep[], step: SuggestStep): SuggestStep[] {
  if (!current.some((entry) => entry.id === step.id)) return [...current, step]
  let run = 2
  while (current.some((entry) => entry.id === `${step.id}#${run}`)) run += 1
  return [...current, { ...step, id: `${step.id}#${run}` }]
}

const BOARD_KEY = "pull.board.v1"

interface StoredBoard {
  job: { title: string; description: string; email: string; dueDate: string }
  looks: Look[]
}

/**
 * A board is built in memory at `/`, so any reload — a dev refresh, a dropped socket — used to drop
 * the stylist back on the landing page mid-run. The board is kept in sessionStorage instead: only
 * looks whose source is a URL can come back (an uploaded file cannot), and the board is the thing
 * that reappears, not the landing page.
 */
function storeBoard(board: StoredBoard) {
  try {
    sessionStorage.setItem(BOARD_KEY, JSON.stringify(board))
  } catch {
    // A full quota is not worth failing a build over.
  }
}

function clearStoredBoard() {
  try {
    sessionStorage.removeItem(BOARD_KEY)
  } catch {
    // ignore
  }
}

function readStoredBoard(): StoredBoard | null {
  try {
    const raw = sessionStorage.getItem(BOARD_KEY)
    if (!raw) return null
    const board = JSON.parse(raw) as StoredBoard
    return board?.looks?.length ? board : null
  } catch {
    return null
  }
}

interface SuggestLooksResponse {
  clientName: string
  gender: { value: "male" | "female" | "unknown"; evidence: string; sourceUrl: string }
  season: { slug: string; label: string; url: string }
  designers: ApiDesigner[]
  trace: SuggestStep[]
  hasMore: boolean
  nextOffset: number
  totalDesigners: number
  error?: string
}

/** The route relays Vogue photos same-origin so the board's canvas crop stays readable. */
function imageSource(image: string): string {
  return `/api/skills/suggest-looks/image?u=${encodeURIComponent(image)}`
}

function looksFromDesigners(designers: ApiDesigner[]): Look[] {
  return designers.flatMap((designer) =>
    designer.looks.map((look) => ({
      id: `suggested:${designer.slug}:${look.lookNo}`,
      fileName: `${designer.slug}-look-${look.lookNo}.jpg`,
      brand: designer.brand,
      lookNo: look.lookNo,
      season: designer.season,
      suggested: true,
      known: { brand: designer.brand, lookNo: look.lookNo, season: designer.season },
      source: imageSource(look.image),
      status: "queued" as const,
    })),
  )
}

function looksFromFiles(files: File[]): Look[] {
  return files
    .filter((file) => /\.(jpe?g|png|webp)$/i.test(file.name) || file.type.startsWith("image/"))
    .map((file, i) => {
      // Identity from the filename up front so the board can group immediately;
      // the read may correct it once the pixels are looked at.
      const parsed = parseLook("", file.name, i + 1)
      return {
        id: `local:${file.name}:${file.size}:${file.lastModified}:${i}`,
        fileName: file.name,
        brand: parsed.brand,
        lookNo: parsed.lookNo,
        season: parsed.season,
        suggested: false,
        source: file,
        status: "queued" as const,
      }
    })
}

export function StartJobFlow({ kind }: { kind: "nav" | "hero" }) {
  const [open, setOpen] = useState(false)
  const [stage, setStage] = useState<"details" | "board">("details")

  const [jobName, setJobName] = useState("")
  const [clientName, setClientName] = useState("")
  const [contactEmail, setContactEmail] = useState("")
  const [deliveryDate, setDeliveryDate] = useState("")

  const [looks, setLooks] = useState<Look[]>([])
  const [suggested, setSuggested] = useState<Look[]>([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const [suggestMeta, setSuggestMeta] = useState<SuggestLooksResponse | null>(null)
  const [suggestTrace, setSuggestTrace] = useState<SuggestStep[]>([])
  /** Every designer the research has returned, in the order the popup lists them. */
  const [designerSources, setDesignerSources] = useState<ApiDesigner[]>([])
  const [designerCount, setDesignerCount] = useState(0)
  const [moreLoading, setMoreLoading] = useState(false)
  const [reserve, setReserve] = useState<Record<string, ApiLook[]>>({})
  const [reserveNote, setReserveNote] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null)

  /** The season index is the one fetch the first press used to wait on — start it when the dialog opens. */
  const warmed = useRef(false)
  useEffect(() => {
    if (!open || warmed.current) return
    warmed.current = true
    void fetch("/api/skills/suggest-looks?warm=1")
  }, [open])

  useEffect(() => {
    const saved = readStoredBoard()
    if (!saved) return
    setJobName(saved.job.title)
    setClientName(saved.job.description)
    setContactEmail(saved.job.email)
    setDeliveryDate(saved.job.dueDate)
    setLooks(
      saved.looks.map((look) => ({
        ...look,
        status: "ready" as const,
        src: typeof look.source === "string" ? look.source : look.src,
      })),
    )
    setStage("board")
  }, [])

  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const releaseUrls = (list: Look[]) => {
    for (const look of list) if (look.src?.startsWith("blob:")) URL.revokeObjectURL(look.src)
  }

  const reset = useCallback(() => {
    clearStoredBoard()
    setLooks((current) => {
      releaseUrls(current)
      return []
    })
    setSuggested((current) => {
      releaseUrls(current)
      return []
    })
    setStage("details")
    setJobName("")
    setClientName("")
    setContactEmail("")
    setDeliveryDate("")
    setNote(null)
    setProgress(null)
    setSuggestMeta(null)
    setSuggestTrace([])
    setDesignerSources([])
    setDesignerCount(0)
    setReserve({})
    setReserveNote(null)
  }, [])

  const takeFiles = useCallback((fileList: FileList | null) => {
    if (!fileList?.length) return
    const incoming = looksFromFiles(Array.from(fileList))
    if (!incoming.length) {
      setNote("No images in that selection — jpg, png or webp.")
      return
    }
    setNote(null)
    setLooks((current) => {
      const seen = new Set(current.map((l) => l.id))
      return [...current, ...incoming.filter((l) => !seen.has(l.id))]
    })
  }, [])

  /** The research run, streamed: each house is shown as it lands instead of after the slowest one. */
  const streamResearch = useCallback(
    async (
      client: string,
      offset: number,
      limit: number,
      on: { step?: (step: SuggestStep) => void; designer?: (designer: ApiDesigner) => void },
    ) => {
      const response = await fetch("/api/skills/suggest-looks", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/x-ndjson" },
        body: JSON.stringify({ clientName: client, offset, limit, stream: true }),
      })
      if (!response.ok || !response.body) {
        const error = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(error.error ?? "The research run failed.")
      }
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      let done: SuggestLooksResponse | null = null
      while (true) {
        const chunk = await reader.read()
        if (chunk.value) buffer += decoder.decode(chunk.value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""
        for (const line of lines) {
          if (!line.trim()) continue
          const event = JSON.parse(line) as
            | { type: "step"; step: SuggestStep }
            | { type: "designer"; designer: ApiDesigner }
            | { type: "error"; message: string }
            | ({ type: "done" } & SuggestLooksResponse)
          if (event.type === "step") on.step?.(event.step)
          else if (event.type === "designer") on.designer?.(event.designer)
          else if (event.type === "error") throw new Error(event.message)
          else done = event
        }
        if (chunk.done) break
      }
      if (!done) throw new Error("The research run ended early.")
      return done
    },
    [],
  )

  const suggestLooks = useCallback(async () => {
    if (loadingSuggestions) return
    const client = clientName.trim()
    if (!client) {
      setNote("Add the client's name first — the research starts there.")
      return
    }
    setLoadingSuggestions(true)
    setNote(null)
    setReserveNote(null)
    setSuggested([])
    setSuggestTrace([])
    setDesignerSources([])
    setDesignerCount(0)
    setReserve({})
    try {
      const data = await streamResearch(client, 0, 10, {
        step: (step) => setSuggestTrace((current) => appendStep(current, step)),
        designer: (designer) => {
          setSuggested((current) => [...current, ...looksFromDesigners([designer])])
          setDesignerSources((current) => [...current, designer])
          setDesignerCount((count) => count + 1)
          setReserve((current) => ({ ...current, [designer.brand]: designer.reserve }))
        },
      })
      setSuggestMeta(data)
      setSuggestTrace(data.trace)
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Could not load suggestions.")
    } finally {
      setLoadingSuggestions(false)
    }
  }, [clientName, loadingSuggestions, streamResearch])

  /** Work the queue: one look at a time, on screen, with its real durations. */
  const processQueue = useCallback(async (queue: Look[]) => {
    setProgress({ done: 0, total: queue.length, label: "queued" })
    for (let i = 0; i < queue.length; i++) {
      const look = queue[i]
      setProgress({ done: i, total: queue.length, label: "cropping" })
      const patch = (l: Look, next: Partial<Look>): Look => (l.id === look.id ? { ...l, ...next } : l)
      setLooks((current) => current.map((l) => patch(l, { status: "cropping" })))
      setSuggested((current) => current.map((l) => patch(l, { status: "cropping" })))
      try {
        const result = await ingestLook({ source: look.source, fileName: look.fileName, known: look.known })
        const next = {
          status: "ready" as const,
          src: result.src,
          steps: result.steps,
          brand: result.brand,
          lookNo: result.lookNo,
          season: result.season,
        }
        setLooks((current) => current.map((l) => patch(l, next)))
        setSuggested((current) => current.map((l) => patch(l, next)))
      } catch {
        setLooks((current) => current.map((l) => patch(l, { status: "error" })))
        setSuggested((current) => current.map((l) => patch(l, { status: "error" })))
      }
      setProgress({ done: i + 1, total: queue.length, label: "done" })
    }
    setProgress(null)
  }, [])

  /**
   * Removing a suggested look refills its row from the same collection. The route sends six spare
   * looks per designer, so the board keeps eight looks per house instead of thinning out on stage.
   */
  /** More designers, five at a time, eight looks each. */
  const suggestMore = useCallback(async () => {
    if (moreLoading || !suggestMeta?.hasMore) return
    const client = clientName.trim()
    if (!client) return
    setMoreLoading(true)
    setNote(null)
    const added: Look[] = []
    try {
      const data = await streamResearch(client, designerCount, 5, {
        step: (step) => setSuggestTrace((current) => appendStep(current, step)),
        designer: (designer) => {
          const fresh = looksFromDesigners([designer])
          added.push(...fresh)
          setSuggested((current) => [...current, ...fresh])
          setDesignerSources((current) => [...current, designer])
          setDesignerCount((count) => count + 1)
          setReserve((current) => ({
            ...current,
            [designer.brand]: [...(current[designer.brand] ?? []), ...designer.reserve],
          }))
        },
      })
      setSuggestMeta((current) =>
        current
          ? { ...current, hasMore: data.hasMore, nextOffset: data.nextOffset, totalDesigners: data.totalDesigners }
          : data,
      )
      // New houses arrive ready to work: crop and read them while the board is already on screen.
      void processQueue(added)
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Could not load more designers.")
    } finally {
      setMoreLoading(false)
    }
  }, [clientName, designerCount, moreLoading, processQueue, streamResearch, suggestMeta?.hasMore])

  const pool = useMemo(() => [...looks, ...suggested], [looks, suggested])

  const canBuild =
    Boolean(jobName.trim()) && Boolean(clientName.trim()) && Boolean(contactEmail.trim()) && pool.length > 0

  const refillSuggestion = useCallback(
    (removed: Look) => {
      if (!removed.suggested) return
      const spare = reserve[removed.brand]?.[0]
      if (!spare) {
        setReserveNote(`No more ${removed.brand} looks left in this collection.`)
        return
      }
      setReserve((current) => ({ ...current, [removed.brand]: (current[removed.brand] ?? []).slice(1) }))
      const replacement: Look = {
        id: `suggested:${removed.brand}:${spare.lookNo}:${Date.now()}`,
        fileName: `${removed.brand}-look-${spare.lookNo}.jpg`,
        brand: removed.brand,
        lookNo: spare.lookNo,
        season: removed.season,
        suggested: true,
        known: { brand: removed.brand, lookNo: spare.lookNo, season: removed.season },
        source: imageSource(spare.image),
        status: "queued",
      }
      setSuggested((current) => [...current, replacement])
      setReserveNote(null)
      void processQueue([replacement])
    },
    [reserve, processQueue],
  )

  /**
   * A house keeps five on the stage board too: the reserve replaces what is removed while it lasts,
   * and past the last spare the row is held at five rather than thinned further.
   */
  const canRemoveLook = useCallback(
    (look: Look, rowCount: number) => {
      if (rowCount > MIN_PER_ROW) return true
      return (reserve[look.brand]?.length ?? 0) > 0
    },
    [reserve],
  )

  const buildBoard = useCallback(() => {
    if (!canBuild) return
    storeBoard({
      job: { title: jobName, description: clientName, email: contactEmail, dueDate: deliveryDate },
      looks: pool
        .filter((look) => typeof look.source === "string")
        .map((look) => ({ ...look, status: "ready" as const })),
    })
    setStage("board")
    setOpen(false)
    void processQueue(pool)
  }, [canBuild, contactEmail, clientName, deliveryDate, jobName, pool, processQueue])

  const trigger =
    kind === "nav" ? (
      <button className="btn btn-primary btn-sm">Start a job</button>
    ) : (
      <button className="btn btn-primary">Start a job</button>
    )

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (next) reset()
        }}
      >
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[760px]">
          <DialogHeader>
            <DialogTitle>Start a job</DialogTitle>
            <DialogDescription>
              Who it is for, when it is due, and the looks to work from.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 py-2 sm:grid-cols-2">
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="job-name">Job name</Label>
              <Input
                id="job-name"
                value={jobName}
                onChange={(e) => setJobName(e.target.value)}
                placeholder="Oscar campaign"
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="client-name">Client name</Label>
              <Input
                id="client-name"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Timothée Chalamet"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="contact-email">Contact email</Label>
              <Input
                id="contact-email"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="agent@example.com"
              />
            </div>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="delivery-date">Due date</Label>
              <DatePicker
                id="delivery-date"
                value={deliveryDate}
                onChange={setDeliveryDate}
                placeholder="Pick a delivery date"
                aria-label="Delivery date"
              />
            </div>
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              takeFiles(e.dataTransfer.files)
            }}
            className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-6 text-center"
            style={{
              borderColor: dragging ? "var(--brand)" : "var(--input)",
              background: dragging ? "var(--accent)" : "transparent",
            }}
          >
            <p className="text-sm text-muted-foreground">
              Drop the looks here, or add the folder your stylist already keeps them in.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                Choose images
              </Button>
              <Button variant="outline" size="sm" onClick={() => folderInputRef.current?.click()}>
                Add image folder
              </Button>
              {pool.length ? (
                <span className="text-[12px] text-muted-foreground">
                  {pool.length} look{pool.length === 1 ? "" : "s"}
                </span>
              ) : null}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              hidden
              onChange={(e) => takeFiles(e.target.files)}
            />
            {/* webkitdirectory opens the OS folder picker (Finder on macOS). */}
            <input
              ref={folderInputRef}
              type="file"
              multiple
              hidden
              // @ts-expect-error — non-standard but the only way to open a folder picker
              webkitdirectory=""
              onChange={(e) => takeFiles(e.target.files)}
            />
          </div>

          {suggested.length ? (
            <p className="text-[13px] leading-snug text-muted-foreground">
              <span className="agent-mark">{suggested.length} looks</span> suggested from{" "}
              {[...new Set(suggested.map((look) => look.brand))].join(", ")}.{" "}
              {suggestMeta ? (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="link"
                      className="h-auto min-h-8 px-0 text-[12px] font-normal text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    >
                      show source
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    side="top"
                    sideOffset={10}
                    className="w-[min(92vw,420px)] p-0"
                  >
                    <div className="flex items-baseline justify-between gap-3 border-b px-4 py-3">
                      <p className="text-[13px] font-medium">The research</p>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {suggestTrace.length} calls
                      </span>
                    </div>

                    <div className="flex flex-col gap-1.5 border-b px-4 py-3">
                      <p className="text-[12px] text-muted-foreground">
                        client read as{" "}
                        <span className="font-medium text-foreground">{suggestMeta.gender.value}</span>
                      </p>
                      <a
                        href={suggestMeta.gender.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="w-fit font-mono text-[10px] underline underline-offset-2"
                        style={{ color: "var(--muted-foreground-soft)" }}
                      >
                        {suggestMeta.gender.evidence}
                      </a>
                      <a
                        href={suggestMeta.season.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 w-fit text-[12px] underline underline-offset-2"
                      >
                        {suggestMeta.season.label} · Vogue Runway →
                      </a>
                    </div>

                    <ul className="flex max-h-[min(34dvh,340px)] flex-col gap-2 overflow-auto p-3 sm:max-h-[min(52vh,440px)]">
                      {designerSources.map((designer) => (
                        <li key={designer.slug} className="rounded-lg border bg-card p-3">
                          <div className="flex items-baseline justify-between gap-3">
                            <p className="text-[13px] font-medium text-foreground">{designer.brand}</p>
                            <span className="font-mono text-[10px] text-muted-foreground">
                              {designer.looks.length} looks
                            </span>
                          </div>
                          <div className="mt-1 flex items-baseline justify-between gap-3">
                            <span
                              className="font-mono text-[10px]"
                              style={{ color: "var(--muted-foreground-soft)" }}
                            >
                              {designer.season}
                            </span>
                            <a
                              href={designer.collectionUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="font-mono text-[10px] text-muted-foreground underline underline-offset-2"
                            >
                              Vogue Runway →
                            </a>
                          </div>
                        </li>
                      ))}
                    </ul>

                    <div className="border-t px-4 py-3">
                      <a
                        href="/suggest-looks"
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-muted-foreground underline underline-offset-2"
                      >
                        the full researched skill
                      </a>
                    </div>
                  </PopoverContent>
                </Popover>
              ) : null}
            </p>
          ) : null}

          {suggestMeta ? (
            <div className="flex flex-col gap-2">
              {suggestMeta.hasMore ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="self-start"
                  onClick={() => void suggestMore()}
                  disabled={moreLoading}
                >
                  {moreLoading ? "Finding 5 more…" : "Add 5 more designers"}
                </Button>
              ) : null}
              {reserveNote ? <p className="text-[11px] text-muted-foreground">{reserveNote}</p> : null}
            </div>
          ) : null}

          {note ? <p className="text-sm text-[var(--destructive)]">{note}</p> : null}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <Button
              variant="ghost"
              className="agent-action"
              onClick={() => void suggestLooks()}
              disabled={loadingSuggestions}
              title="Seeds the board with menswear picks"
            >
              <Sparkles className="size-4" aria-hidden />
              {loadingSuggestions ? "Finding looks…" : "Suggest looks"}
            </Button>
            <div className="flex items-center gap-2">
              <DialogClose asChild>
                <Button variant="ghost">Cancel</Button>
              </DialogClose>
              <Button onClick={buildBoard} disabled={!canBuild}>
                Build board
              </Button>
            </div>
          </div>

          {/* The run is visible while it happens: every call the research makes, in order. */}
          {suggestTrace.length ? (
            <div className="max-h-[260px] overflow-y-auto">
              <AgentTrace
                steps={suggestTrace}
                title={loadingSuggestions ? "Researching the client" : "Research run"}
                compact
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {stage === "board" ? (
        <ReviewBoard
          looks={pool}
          job={{ title: jobName, description: clientName, email: contactEmail, dueDate: deliveryDate }}
          progress={progress}
          onRemoveLook={refillSuggestion}
          canRemove={canRemoveLook}
          onSuggest={suggestMeta?.hasMore ? () => void suggestMore() : undefined}
          suggesting={moreLoading}
          suggestError={note}
          onBack={() => {
            clearStoredBoard()
            setStage("details")
            setOpen(true)
          }}
        />
      ) : null}
    </>
  )
}
