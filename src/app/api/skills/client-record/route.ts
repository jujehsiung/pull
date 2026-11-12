/**
 * Client record research — web first, stylist corrects it.
 *
 * The start-job form asks the person's name and then, if the stylist presses Research, this route
 * reads Vogue's own search results for that client's red-carpet/style coverage, takes the text of
 * the best few articles, and asks the inference backend to extract only what those pages say:
 * houses worn, the register, the silhouettes. Every source is returned with the record, and the
 * form makes all of it editable — the draft saves typing, the stylist is the source of truth.
 *
 * If no evidence is found (a private client, a model that cannot answer), the route says so and
 * returns an empty record instead of inventing houses. The stylist fills it by hand.
 */
import { NextResponse } from "next/server"

import { deepseek } from "@/lib/agent/providers/deepseek"
import type { AgentStep } from "@/lib/agent/trace"
import { OCCASIONS, isOccasion, type OccasionKey } from "@/lib/agent/skills/occasion"
import {
  EMPTY_RECORD,
  PRESENTATION_OPTIONS,
  registersFromText,
  type ClientBrand,
  type ClientRecordDraft,
  type ClientRecordSource,
  type Presentation,
} from "@/lib/agent/skills/record"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

const MAX_SOURCES = 5
const MAX_CHARS_PER_PAGE = 4_500

async function getText(url: string, timeoutMs = 12_000): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "text/html" },
      signal: controller.signal,
      cache: "no-store",
    })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
}

function stripHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim()
}

/** The readable part of an article: <main> if it exists, otherwise the body, minus chrome. */
function articleText(html: string): string {
  const main = html.match(/<main[\s\S]*?<\/main>/i)?.[0] ?? html
  const text = stripHtml(main)
  return text.slice(0, MAX_CHARS_PER_PAGE)
}

interface SearchHit {
  url: string
  label: string
  score: number
}

/** Vogue's own site search — the discovery step. No general web search is used or needed. */
async function vogueSearch(clientName: string): Promise<SearchHit[]> {
  const query = encodeURIComponent(`${clientName} style red carpet`)
  const html = await getText(`https://www.vogue.com/search?q=${query}`)
  if (!html) return []

  const nameTokens = clientName
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 2)

  const hits = new Map<string, SearchHit>()
  const link = /<a[^>]+href="(\/(?:article|slideshow)\/[a-z0-9-]+)"[^>]*>([\s\S]*?)<\/a>/gi
  for (const match of html.matchAll(link)) {
    const url = `https://www.vogue.com${match[1]}`
    if (hits.has(url)) continue
    const slug = match[1].toLowerCase()
    const label = stripHtml(match[2]).slice(0, 140) || slug.split("/").pop()!.replace(/-/g, " ")
    let score = 0
    for (const token of nameTokens) if (slug.includes(token)) score += 3
    if (/red-carpet|best-dressed|style|oscars|met-gala|premiere|carpet/.test(slug)) score += 2
    hits.set(url, { url, label, score })
  }

  return [...hits.values()]
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SOURCES)
}

function isPresentation(value: unknown): value is Presentation {
  return typeof value === "string" && PRESENTATION_OPTIONS.some((option) => option.value === value)
}

function cleanBrands(value: unknown): ClientBrand[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const brands: ClientBrand[] = []
  for (const row of value) {
    const raw = typeof row === "string" ? row : row && typeof row === "object" ? (row as { brand?: unknown }).brand : null
    if (typeof raw !== "string") continue
    const brand = raw.trim().slice(0, 60)
    if (!brand || seen.has(brand.toLowerCase())) continue
    seen.add(brand.toLowerCase())
    const note =
      row && typeof row === "object" && typeof (row as { note?: unknown }).note === "string"
        ? (row as { note: string }).note.trim().slice(0, 160)
        : undefined
    brands.push({ brand, ...(note ? { note } : {}) })
  }
  return brands.slice(0, 20)
}

function cleanList(value: unknown, max = 6): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, max)
}

const RESEARCH_SYSTEM = `You are the research desk of Pull, a fashion stylist's sample-trafficking tool.
You receive a client's name, the occasion the looks are for, and text from Vogue's coverage of that client.
Return ONE JSON object and nothing else:
{
  "presentation": "menswear" | "womenswear" | "both" | "unknown",
  "brandsWorn": [{ "brand": string, "note": string }],
  "registers": string[],
  "silhouettes": string[],
  "notes": string
}
Rules:
- Use ONLY the provided text. No outside knowledge, no guesses.
- brandsWorn: houses explicitly named in the text with something the client wore. note is a short phrase from the text, e.g. "custom Prada at the 2025 premiere". If none are named, use [].
- registers: choose from tailoring, soft-tailoring, evening, glamour, heritage, romantic, minimal, concept, avant-garde, texture, art, street, party, leather, sport, polish, classic, casual, denim, knitwear, utility, deconstructed, monochrome, dramatic, craft, hybrid, surreal, rock, luxury. Only those the text supports.
- silhouettes: short lowercase phrases the text supports, e.g. "slim tailoring", "oversized outerwear". Max 5.
- notes: 1-2 sentences summarising the client's style from the text. Empty string if nothing is supported.
- If the text has no usable evidence, return empty arrays and empty notes.`

interface ResearchResult {
  record: ClientRecordDraft
  sources: ClientRecordSource[]
  provider: string
  trace: AgentStep[]
  warning?: string
}

async function research(clientName: string, occasion: OccasionKey): Promise<ResearchResult> {
  const trace: AgentStep[] = []
  const at = () => new Date().toISOString()
  const started = Date.now()

  const hits = await vogueSearch(clientName)
  trace.push({
    id: "research.vogue.search",
    tool: "vogue.search",
    status: hits.length ? "ok" : "error",
    args: { query: `${clientName} style red carpet` },
    result: { sources: hits.length, top: hits.slice(0, 3).map((hit) => hit.label) },
    durationMs: Date.now() - started,
    at: at(),
  })

  const sources: ClientRecordSource[] = hits.map((hit) => ({ label: hit.label, url: hit.url }))
  if (!hits.length) {
    return {
      record: { ...EMPTY_RECORD },
      sources,
      provider: "none",
      trace,
      warning: `Vogue's search returned nothing for “${clientName}”. Fill the record in by hand.`,
    }
  }

  const readStarted = Date.now()
  const pages = await Promise.all(
    hits.map(async (hit) => {
      const html = await getText(hit.url)
      return html ? { hit, text: articleText(html) } : null
    }),
  )
  const readable = pages.filter((page): page is { hit: SearchHit; text: string } => Boolean(page?.text))
  trace.push({
    id: "research.vogue.read",
    tool: "vogue.read",
    status: readable.length ? "ok" : "error",
    args: { sources: hits.length },
    result: { read: readable.length, chars: readable.reduce((sum, page) => sum + page.text.length, 0) },
    durationMs: Date.now() - readStarted,
    at: at(),
  })

  const usableSources = readable.map((page) => ({ label: page.hit.label, url: page.hit.url }))
  if (!readable.length) {
    return {
      record: { ...EMPTY_RECORD },
      sources,
      provider: "none",
      trace,
      warning: "The articles could not be read. Fill the record in by hand.",
    }
  }

  if (!deepseek.available()) {
    return {
      record: { ...EMPTY_RECORD },
      sources: usableSources,
      provider: "none",
      trace,
      warning: "No extraction key is configured, so the record is empty. Fill it in by hand.",
    }
  }

  const excerpts = readable
    .map((page, index) => `--- [${index}] ${page.hit.url}\n${page.text}`)
    .join("\n\n")
  const modelStarted = Date.now()
  try {
    const result = await deepseek.run({
      system: RESEARCH_SYSTEM,
      user: `CLIENT: ${clientName}\nOCCASION: ${OCCASIONS[occasion].label}\nSOURCES:\n${excerpts}`,
      json: true,
      maxTokens: 1_400,
      timeoutMs: 30_000,
    })
    const json = (result.json ?? {}) as {
      presentation?: unknown
      brandsWorn?: unknown
      registers?: unknown
      silhouettes?: unknown
      notes?: unknown
    }
    const silhouettes = cleanList(json.silhouettes, 5)
    const notes = typeof json.notes === "string" ? json.notes.trim().slice(0, 600) : ""
    const registers = registersFromText(
      Array.isArray(json.registers) ? json.registers.filter((entry) => typeof entry === "string").join(" ") : "",
      silhouettes.join(" "),
      notes,
    )
    const record: ClientRecordDraft = {
      presentation: isPresentation(json.presentation) ? json.presentation : "unknown",
      brandsWorn: cleanBrands(json.brandsWorn),
      registers,
      silhouettes,
      notes,
    }
    trace.push({
      id: "research.extract",
      tool: `${result.provider}.run`,
      status: "ok",
      args: { model: result.model, sources: usableSources.length },
      result: {
        brands: record.brandsWorn.length,
        registers: record.registers.length,
        silhouettes: record.silhouettes.length,
      },
      durationMs: Date.now() - modelStarted,
      at: at(),
    })
    return {
      record,
      sources: usableSources,
      provider: result.provider,
      trace,
      ...(record.brandsWorn.length
        ? {}
        : { warning: "The pages named no houses, so the record is empty. Fill it in by hand." }),
    }
  } catch (error) {
    trace.push({
      id: "research.extract",
      tool: "deepseek.run",
      status: "error",
      args: { model: "deepseek-chat" },
      result: { error: error instanceof Error ? error.message : "extraction failed" },
      durationMs: Date.now() - modelStarted,
      at: at(),
    })
    return {
      record: { ...EMPTY_RECORD },
      sources: usableSources,
      provider: "none",
      trace,
      warning: "The extraction call failed. Fill the record in by hand.",
    }
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    clientName?: string
    occasion?: string
  }
  const clientName = (body.clientName ?? "").trim()
  if (!clientName) return NextResponse.json({ error: "A client name is required." }, { status: 400 })
  const occasion: OccasionKey = isOccasion(body.occasion) ? body.occasion : "editorial"

  try {
    const result = await research(clientName, occasion)
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "The research run failed." },
      { status: 502 },
    )
  }
}
