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
import { useCallback, useMemo, useRef, useState } from "react"
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
import { ingestLook } from "./ingest"
import { ReviewBoard, type Look } from "./ReviewBoard"

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

interface SuggestStep {
  id: string
  tool: string
  status: string
  durationMs?: number
  args?: unknown
  result?: unknown
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

const SHOWN_PER_DESIGNER = 8

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
  const [designerCount, setDesignerCount] = useState(0)
  const [moreLoading, setMoreLoading] = useState(false)
  const [reserve, setReserve] = useState<Record<string, ApiLook[]>>({})
  const [reserveNote, setReserveNote] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const releaseUrls = (list: Look[]) => {
    for (const look of list) if (look.src?.startsWith("blob:")) URL.revokeObjectURL(look.src)
  }

  const reset = useCallback(() => {
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

  /** The research run: client → gender → Vogue Runway season → designers × eight looks. */
  const runResearch = useCallback(async (client: string, offset: number, limit: number) => {
    const response = await fetch("/api/skills/suggest-looks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientName: client, offset, limit }),
    })
    const data = (await response.json()) as SuggestLooksResponse
    if (!response.ok) throw new Error(data.error ?? "The research run failed.")
    return data
  }, [])

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
    try {
      const data = await runResearch(client, 0, 10)
      setSuggested(looksFromDesigners(data.designers))
      setSuggestMeta(data)
      setSuggestTrace(data.trace)
      setDesignerCount(data.designers.length)
      setReserve(Object.fromEntries(data.designers.map((designer) => [designer.brand, designer.reserve])))
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Could not load suggestions.")
    } finally {
      setLoadingSuggestions(false)
    }
  }, [clientName, loadingSuggestions, runResearch])

  /** More designers, five at a time, eight looks each. */
  const suggestMore = useCallback(async () => {
    if (moreLoading || !suggestMeta?.hasMore) return
    const client = clientName.trim()
    if (!client) return
    setMoreLoading(true)
    setNote(null)
    try {
      const data = await runResearch(client, designerCount, 5)
      setSuggested((current) => [...current, ...looksFromDesigners(data.designers)])
      setSuggestTrace((current) => [...current, ...data.trace])
      setDesignerCount((count) => count + data.designers.length)
      setSuggestMeta((current) =>
        current
          ? { ...current, hasMore: data.hasMore, nextOffset: data.nextOffset, totalDesigners: data.totalDesigners }
          : data,
      )
      setReserve((current) => {
        const next = { ...current }
        for (const designer of data.designers) {
          next[designer.brand] = [...(next[designer.brand] ?? []), ...designer.reserve]
        }
        return next
      })
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Could not load more designers.")
    } finally {
      setMoreLoading(false)
    }
  }, [clientName, designerCount, moreLoading, runResearch, suggestMeta?.hasMore])

  const pool = useMemo(() => [...looks, ...suggested], [looks, suggested])

  const canBuild =
    Boolean(jobName.trim()) && Boolean(clientName.trim()) && Boolean(contactEmail.trim()) && pool.length > 0

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

  const buildBoard = useCallback(() => {
    if (!canBuild) return
    setStage("board")
    setOpen(false)
    void processQueue(pool)
  }, [canBuild, pool, processQueue])

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
              <a
                href="/suggest-looks"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2"
              >
                See the researched skill — provenance and trace
              </a>
              .
            </p>
          ) : null}

          {suggestMeta ? (
            <div className="flex flex-col gap-2">
              <p className="text-[12px] leading-snug text-muted-foreground">
                client read as <b>{suggestMeta.gender.value}</b> · {suggestMeta.season.label} ·{" "}
                {designerCount} designers × {SHOWN_PER_DESIGNER} looks ·{" "}
                <a
                  href={suggestMeta.season.url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2"
                >
                  Vogue Runway season
                </a>
              </p>
              <details className="text-[11px] text-muted-foreground">
                <summary className="cursor-pointer">trace · {suggestTrace.length} calls</summary>
                <ol className="mt-1 flex flex-col gap-1">
                  {suggestTrace.map((step) => (
                    <li key={step.id} className="font-mono text-[10px]">
                      {step.tool} · {step.durationMs ?? 0} ms
                    </li>
                  ))}
                </ol>
              </details>
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
        </DialogContent>
      </Dialog>

      {stage === "board" ? (
        <ReviewBoard
          looks={pool}
          job={{ title: jobName, description: clientName, email: contactEmail, dueDate: deliveryDate }}
          progress={progress}
          onRemoveLook={refillSuggestion}
          onBack={() => {
            setStage("details")
            setOpen(true)
          }}
        />
      ) : null}
    </>
  )
}
