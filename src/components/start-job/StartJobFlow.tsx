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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { AgentTrace } from "@/components/AgentTrace"
import {
  DEFAULT_OCCASION,
  OCCASION_OPTIONS,
  occasionLabel,
  type OccasionKey,
  type Register,
} from "@/lib/agent/skills/occasion"
import {
  PRESENTATION_OPTIONS,
  REGISTER_OPTIONS,
  splitBrands,
  type Presentation,
} from "@/lib/agent/skills/record"
import { describeTaste, pickCached, warmTaste } from "@/lib/taste"
import type { AgentStep } from "@/lib/agent/trace"
import { ingestLook } from "./ingest"
import { MIN_PER_ROW, ReviewBoard, suggestionId, type Look } from "./ReviewBoard"

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

/** The landing renders several start-a-job flows; only one may restore the stored board. */
let boardRestoreOwnerTaken = false

interface StoredBoard {
  job: { title: string; description: string; email: string; dueDate: string }
  /** The occasion the board was researched for; a reload keeps the same brief. */
  occasion?: OccasionKey
  presentation?: Presentation
  seasonMode?: "latest" | "delivery"
  styleBrief?: string
  /** The corrected client record, kept as the strings the form edits. */
  record?: {
    brandsWorn: string
    brandsAvoid: string
    register: string
    registers: string[]
    silhouettes: string[]
    notes: string
    sources: { label: string; url: string }[]
    provider: string | null
  }
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
  occasion: { key: OccasionKey; label: string; formality: number }
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
      id: suggestionId(designer.slug, look.lookNo),
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
  /** What the looks are for. Red carpet is the most formal; personal the most casual. */
  const [occasion, setOccasion] = useState<OccasionKey>(DEFAULT_OCCASION)
  /** Presentation picks the runway rail; "unknown" lets the name research decide. */
  const [presentation, setPresentation] = useState<Presentation>("unknown")
  /** Latest collection, or the in-store season for the delivery date. */
  const [seasonMode, setSeasonMode] = useState<"latest" | "delivery">("latest")
  const [styleBrief, setStyleBrief] = useState("")

  /** The client record — researched from the web first, then corrected by the stylist. */
  const [recordOpen, setRecordOpen] = useState(false)
  const [researching, setResearching] = useState(false)
  const [brandsWornText, setBrandsWornText] = useState("")
  const [brandsAvoidText, setBrandsAvoidText] = useState("")
  const [recordRegister, setRecordRegister] = useState<Register | "">("")
  const [recordRegisters, setRecordRegisters] = useState<string[]>([])
  const [recordSilhouettes, setRecordSilhouettes] = useState<string[]>([])
  const [recordNotes, setRecordNotes] = useState("")
  const [recordSources, setRecordSources] = useState<{ label: string; url: string }[]>([])
  const [recordProvider, setRecordProvider] = useState<string | null>(null)
  const [recordWarning, setRecordWarning] = useState<string | null>(null)

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

  /** One research run at a time: a double press would append the same houses twice. */
  const researchInFlight = useRef(false)

  /** The season index is the one fetch the first press used to wait on — start it when the dialog opens. */
  const warmed = useRef(false)
  useEffect(() => {
    if (!open || warmed.current) return
    warmed.current = true
    void fetch("/api/skills/suggest-looks?warm=1")
  }, [open])

  useEffect(() => {
    if (boardRestoreOwnerTaken) return
    const saved = readStoredBoard()
    if (!saved) return
    boardRestoreOwnerTaken = true
    setJobName(saved.job.title)
    setClientName(saved.job.description)
    setContactEmail(saved.job.email)
    setDeliveryDate(saved.job.dueDate)
    setOccasion(saved.occasion ?? DEFAULT_OCCASION)
    setPresentation(saved.presentation ?? "unknown")
    setSeasonMode(saved.seasonMode ?? "latest")
    setStyleBrief(saved.styleBrief ?? "")
    setBrandsWornText(saved.record?.brandsWorn ?? "")
    setBrandsAvoidText(saved.record?.brandsAvoid ?? "")
    setRecordRegister((saved.record?.register as Register | "") ?? "")
    setRecordRegisters(saved.record?.registers ?? [])
    setRecordSilhouettes(saved.record?.silhouettes ?? [])
    setRecordNotes(saved.record?.notes ?? "")
    setRecordSources(saved.record?.sources ?? [])
    setRecordProvider(saved.record?.provider ?? null)
    setRecordOpen(Boolean(saved.record?.brandsWorn || saved.record?.sources?.length))
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
    setOccasion(DEFAULT_OCCASION)
    setPresentation("unknown")
    setSeasonMode("latest")
    setStyleBrief("")
    setRecordOpen(false)
    setResearching(false)
    setBrandsWornText("")
    setBrandsAvoidText("")
    setRecordRegister("")
    setRecordRegisters([])
    setRecordSilhouettes([])
    setRecordNotes("")
    setRecordSources([])
    setRecordProvider(null)
    setRecordWarning(null)
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

  /** The record/brief block every research run sends. */
  const researchPayload = useMemo(
    () => ({
      presentation,
      seasonMode,
      deliveryDate,
      styleBrief,
      record: {
        brandsWorn: splitBrands(brandsWornText),
        brandsAvoid: splitBrands(brandsAvoidText),
        registers: [...recordRegisters, ...(recordRegister ? [recordRegister] : [])],
        silhouettes: recordSilhouettes,
      },
    }),
    [
      presentation,
      seasonMode,
      deliveryDate,
      styleBrief,
      brandsWornText,
      brandsAvoidText,
      recordRegisters,
      recordRegister,
      recordSilhouettes,
    ],
  )

  /**
   * Research the client from Vogue's own coverage, then let the stylist correct it. The draft fills
   * the record panel; nothing reaches the board until Build board.
   */
  const researchClient = useCallback(async () => {
    const client = clientName.trim()
    if (!client) {
      setNote("Add the client's name first — research starts there.")
      return
    }
    setResearching(true)
    setRecordWarning(null)
    try {
      const response = await fetch("/api/skills/client-record", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientName: client, occasion }),
      })
      const data = (await response.json().catch(() => ({}))) as {
        record?: {
          presentation?: Presentation
          brandsWorn?: { brand: string; note?: string }[]
          registers?: string[]
          silhouettes?: string[]
          notes?: string
        }
        sources?: { label: string; url: string }[]
        provider?: string
        warning?: string
        error?: string
      }
      if (!response.ok) throw new Error(data.error ?? "The research run failed.")
      const record = data.record ?? {}
      setRecordOpen(true)
      setRecordProvider(data.provider ?? null)
      setRecordSources(data.sources ?? [])
      setRecordWarning(data.warning ?? null)
      setRecordNotes(record.notes ?? "")
      setRecordRegisters(record.registers ?? [])
      setRecordSilhouettes(record.silhouettes ?? [])
      if (record.brandsWorn?.length) {
        setBrandsWornText(record.brandsWorn.map((brand) => brand.brand).join(", "))
      }
      if (record.presentation && record.presentation !== "unknown" && presentation === "unknown") {
        setPresentation(record.presentation)
      }
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Could not research the client.")
    } finally {
      setResearching(false)
    }
  }, [clientName, occasion, presentation])

  /** The research run, streamed: each house is shown as it lands instead of after the slowest one. */
  const streamResearch = useCallback(
    async (
      client: string,
      occasion: OccasionKey,
      brief: {
        presentation: Presentation
        seasonMode: "latest" | "delivery"
        deliveryDate: string
        styleBrief: string
        record: { brandsWorn: string[]; brandsAvoid: string[]; registers: string[]; silhouettes: string[] }
      },
      offset: number,
      limit: number,
      on: { step?: (step: SuggestStep) => void; designer?: (designer: ApiDesigner) => void },
    ) => {
      const response = await fetch("/api/skills/suggest-looks", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/x-ndjson" },
        body: JSON.stringify({ clientName: client, occasion, ...brief, offset, limit, stream: true }),
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
    if (loadingSuggestions || researchInFlight.current) return
    researchInFlight.current = true
    const client = clientName.trim()
    if (!client) {
      researchInFlight.current = false
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
      const data = await streamResearch(client, occasion, researchPayload, 0, 10, {
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
      researchInFlight.current = false
      setLoadingSuggestions(false)
    }
  }, [clientName, loadingSuggestions, occasion, researchPayload, streamResearch])

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
   * looks per designer, so the board keeps five looks per house instead of thinning out on stage.
   */
  /** More designers, five at a time, five looks each — a house is one row. */
  const suggestMore = useCallback(async () => {
    if (moreLoading || !suggestMeta?.hasMore || researchInFlight.current) return
    researchInFlight.current = true
    const client = clientName.trim()
    if (!client) return
    setMoreLoading(true)
    setNote(null)
    const added: Look[] = []
    try {
      const data = await streamResearch(client, occasion, researchPayload, designerCount, 5, {
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
      researchInFlight.current = false
      setMoreLoading(false)
    }
  }, [clientName, designerCount, moreLoading, occasion, processQueue, researchPayload, streamResearch, suggestMeta?.hasMore])

  const pool = useMemo(() => [...looks, ...suggested], [looks, suggested])

  const canBuild =
    Boolean(jobName.trim()) && Boolean(clientName.trim()) && Boolean(contactEmail.trim()) && pool.length > 0

  /**
   * Taste picks the replacement here too, and the row is filled in the same tick as the delete: the
   * queued tile is the fifth look immediately, and the crop/read happens behind it. A cached pick
   * is the taste choice; a cold cache still takes the next spare rather than leaving a gap.
   */
  const refillSuggestion = useCallback(
    (removed: Look, row: Look[]) => {
      if (!removed.suggested) return
      const candidates = reserve[removed.brand] ?? []
      const entries = candidates
        .map((spare, index) => ({ spare, index }))
        .filter(
          (entry) =>
            !suggested.some(
              (look) => look.brand === removed.brand && look.lookNo === entry.spare.lookNo,
            ),
        )
      if (!entries.length) {
        setReserveNote(`No more ${removed.brand} looks left in this collection.`)
        return
      }
      const kept = row.flatMap((look) => (look.src ? [{ id: look.id, src: look.src }] : []))
      const slot = pickCached(
        kept,
        entries.map((entry) => ({
          id: `${removed.brand}:${entry.spare.lookNo}`,
          src: imageSource(entry.spare.image),
        })),
      )
      const picked = entries[slot >= 0 ? slot : 0]
      setReserve((current) => ({
        ...current,
        [removed.brand]: (current[removed.brand] ?? []).filter((_, slotIndex) => slotIndex !== picked.index),
      }))
      const replacement: Look = {
        id: suggestionId(removed.brand, picked.spare.lookNo),
        fileName: `${removed.brand}-look-${picked.spare.lookNo}.jpg`,
        brand: removed.brand,
        lookNo: picked.spare.lookNo,
        season: removed.season,
        suggested: true,
        known: { brand: removed.brand, lookNo: picked.spare.lookNo, season: removed.season },
        source: imageSource(picked.spare.image),
        status: "queued",
      }
      setSuggested((current) => [...current, replacement])
      void processQueue([replacement])
      setReserveNote(null)
      void describeTaste(kept, {
        id: `${removed.brand}:${picked.spare.lookNo}`,
        src: imageSource(picked.spare.image),
      }).then((why) => setReserveNote(`Taste · look ${picked.spare.lookNo} — ${why}`))
    },
    [reserve, processQueue, suggested],
  )

  // Warm the reserve while the board is on screen, so the first delete already has signatures.
  useEffect(() => {
    if (stage !== "board") return
    warmTaste(
      Object.values(reserve)
        .flatMap((list) => list.slice(0, 6).map((spare) => imageSource(spare.image)))
        .slice(0, 40),
    )
  }, [stage, reserve])

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
      occasion,
      presentation,
      seasonMode,
      styleBrief,
      record: {
        brandsWorn: brandsWornText,
        brandsAvoid: brandsAvoidText,
        register: recordRegister,
        registers: recordRegisters,
        silhouettes: recordSilhouettes,
        notes: recordNotes,
        sources: recordSources,
        provider: recordProvider,
      },
      looks: pool
        .filter((look) => typeof look.source === "string")
        .map((look) => ({ ...look, status: "ready" as const })),
    })
    setStage("board")
    setOpen(false)
    void processQueue(pool)
  }, [
    brandsAvoidText,
    brandsWornText,
    canBuild,
    contactEmail,
    clientName,
    deliveryDate,
    jobName,
    occasion,
    pool,
    presentation,
    processQueue,
    recordNotes,
    recordProvider,
    recordRegister,
    recordRegisters,
    recordSilhouettes,
    recordSources,
    seasonMode,
    styleBrief,
  ])

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
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="occasion">Occasion</Label>
              <Select value={occasion} onValueChange={(value) => setOccasion(value as OccasionKey)}>
                <SelectTrigger id="occasion" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OCCASION_OPTIONS.map((option) => (
                    <SelectItem key={option.key} value={option.key}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Red carpet is the most formal; personal the most casual.
              </p>
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
            <div className="flex flex-col gap-2">
              <Label htmlFor="presentation">Presentation</Label>
              <Select value={presentation} onValueChange={(value) => setPresentation(value as Presentation)}>
                <SelectTrigger id="presentation" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRESENTATION_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="season-mode">Collection</Label>
              <Select value={seasonMode} onValueChange={(value) => setSeasonMode(value as "latest" | "delivery")}>
                <SelectTrigger id="season-mode" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="latest">Latest collection</SelectItem>
                  <SelectItem value="delivery">Delivery date</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="delivery-date">Delivery date</Label>
              <DatePicker
                id="delivery-date"
                value={deliveryDate}
                onChange={setDeliveryDate}
                placeholder="Pick a delivery date"
                aria-label="Delivery date"
              />
              {seasonMode === "delivery" && !deliveryDate ? (
                <p className="text-[11px] text-muted-foreground">
                  Add the date the looks are needed — the in-store collection comes from it.
                </p>
              ) : null}
            </div>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="style-brief">Style brief (optional)</Label>
              <Textarea
                id="style-brief"
                value={styleBrief}
                onChange={(event) => setStyleBrief(event.target.value)}
                rows={2}
                placeholder="e.g. sharp black tailoring, oversized outerwear, no logos"
              />
            </div>
          </div>

          {/* The client record: researched from the web first, corrected here. */}
          <div className="rounded-lg border border-border">
            <button
              type="button"
              onClick={() => setRecordOpen((current) => !current)}
              aria-expanded={recordOpen}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
            >
              <span className="flex flex-col gap-0.5">
                <span className="text-[13px] font-medium text-foreground">Client record</span>
                <span className="text-[11px] text-muted-foreground">
                  Optional — research fills it from Vogue, then you correct it.
                </span>
              </span>
              <span className="text-[11px] text-muted-foreground">{recordOpen ? "hide" : "open"}</span>
            </button>
            {recordOpen ? (
              <div className="flex flex-col gap-4 border-t border-border px-4 py-4">
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    variant="ghost"
                    className="agent-action"
                    onClick={() => void researchClient()}
                    disabled={researching || !clientName.trim()}
                  >
                    <Sparkles className="size-4" aria-hidden />
                    {researching ? "Researching…" : "Research client"}
                  </Button>
                  {recordProvider || recordSources.length ? (
                    <span className="text-[11px] text-muted-foreground">
                      draft · {recordSources.length} source{recordSources.length === 1 ? "" : "s"}
                      {recordProvider && recordProvider !== "none" ? ` · ${recordProvider}` : ""}
                    </span>
                  ) : null}
                </div>
                {recordWarning ? (
                  <p className="text-[11px] text-[var(--warning)]">{recordWarning}</p>
                ) : null}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="brands-worn">Brands worn</Label>
                    <Input
                      id="brands-worn"
                      value={brandsWornText}
                      onChange={(event) => setBrandsWornText(event.target.value)}
                      placeholder="Givenchy, Prada, Chrome Hearts"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="brands-avoid">Brands to avoid</Label>
                    <Input
                      id="brands-avoid"
                      value={brandsAvoidText}
                      onChange={(event) => setBrandsAvoidText(event.target.value)}
                      placeholder="e.g. Prada"
                    />
                  </div>
                  <div className="flex flex-col gap-2 sm:col-span-2">
                    <Label htmlFor="record-register">Register (optional)</Label>
                    <Select
                      value={recordRegister || "none"}
                      onValueChange={(value) =>
                        setRecordRegister(value === "none" ? "" : (value as Register))
                      }
                    >
                      <SelectTrigger id="record-register" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Not set</SelectItem>
                        {REGISTER_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {recordNotes ? (
                  <p className="text-[12px] leading-relaxed text-muted-foreground">{recordNotes}</p>
                ) : null}
                {recordRegisters.length ? (
                  <p className="text-[11px] text-muted-foreground">Read as · {recordRegisters.join(" · ")}</p>
                ) : null}
                {recordSilhouettes.length ? (
                  <p className="text-[11px] text-muted-foreground">
                    Silhouettes · {recordSilhouettes.join(" · ")}
                  </p>
                ) : null}
                {recordSources.length ? (
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Sources ·{" "}
                    {recordSources.slice(0, 4).map((source, index) => (
                      <span key={source.url}>
                        {index ? " · " : ""}
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noreferrer"
                          className="underline underline-offset-2"
                        >
                          {source.label}
                        </a>
                      </span>
                    ))}
                  </p>
                ) : null}
              </div>
            ) : null}
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
                      <p className="text-[12px] text-muted-foreground">
                        occasion read as{" "}
                        <span className="font-medium text-foreground">{suggestMeta.occasion.label}</span>
                      </p>
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
              title="Seeds the board from the client and the occasion"
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
          brief={occasionLabel(occasion)}
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
