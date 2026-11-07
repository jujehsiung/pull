/**
 * Suggest looks — the research route behind the start-job button.
 *
 * The button used to read a static fixture manifest. This route does the work the demo claims:
 *
 *   1. web-research the client's name and resolve their gender (Wikipedia first, genderize.io as a
 *      fallback for people Wikipedia does not know),
 *   2. open the Vogue Runway season that matches that gender (menswear or ready-to-wear),
 *   3. crawl the designers on that season's index and, for each one, read its collection slideshow
 *      and take eight looks,
 *   4. keep six extra looks per designer as the reserve the UI backfills from when a look is removed.
 *
 * `limit` is 10 for the first press and 5 for every "more designers" press; `offset` is the number of
 * designers already on screen. Nothing is generated: designers, season and looks are read from Vogue
 * Runway, and every response carries the source URL per designer plus the trace of the calls made.
 */
import { NextResponse } from "next/server"
import type { AgentStep } from "@/lib/agent/trace"
import studied from "@/lib/agent/skills/suggest-looks-dataset.json"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

const SHOWN_PER_DESIGNER = 8
const RESERVE_PER_DESIGNER = 6
const MAX_DESIGNERS = 60

interface Look {
  lookNo: number
  image: string
}

interface Designer {
  brand: string
  slug: string
  season: string
  collectionUrl: string
  slideshowUrl: string
  looks: Look[]
  reserve: Look[]
}

interface CachedDesigner {
  brand: string
  looks: Look[]
  ms: number
}

const designerCache = new Map<string, CachedDesigner>()
const indexCache = new Map<string, { at: number; slugs: string[] }>()

async function get(url: string, accept = "text/html"): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 25_000)
  try {
    return await fetch(url, {
      headers: { "user-agent": UA, accept },
      signal: controller.signal,
      cache: "no-store",
    })
  } finally {
    clearTimeout(timer)
  }
}

/** Wikipedia first (with pronouns), genderize.io as the fallback. */
async function resolveGender(clientName: string): Promise<{ gender: "male" | "female" | "unknown"; evidence: string; sourceUrl: string; ms: number }> {
  const started = Date.now()
  try {
    const search = await get(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(clientName)}&format=json&srlimit=1`,
      "application/json",
    )
    if (search.ok) {
      const body = (await search.json()) as { query?: { search?: { title: string }[] } }
      const title = body.query?.search?.[0]?.title
      if (title) {
        const summaryRes = await get(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`,
          "application/json",
        )
        if (summaryRes.ok) {
          const summary = (await summaryRes.json()) as { extract?: string; content_urls?: { desktop?: { page?: string } } }
          const text = (summary.extract ?? "").toLowerCase()
          const male = (text.match(/\b(he|his|him|actor|king|prince|sir)\b/g) ?? []).length
          const female = (text.match(/\b(she|her|hers|actress|queen|princess|dame)\b/g) ?? []).length
          if (male !== female) {
            return {
              gender: male > female ? "male" : "female",
              evidence: `Wikipedia: “${title}” (${male > female ? male : female} gendered cues)`,
              sourceUrl: summary.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`,
              ms: Date.now() - started,
            }
          }
        }
      }
    }
  } catch {
    // fall through to the first-name guess
  }
  const first = clientName.trim().split(/\s+/)[0]?.replace(/[^\p{L}-]/gu, "") ?? ""
  if (first) {
    try {
      const res = await get(`https://api.genderize.io/?name=${encodeURIComponent(first)}`, "application/json")
      if (res.ok) {
        const body = (await res.json()) as { gender?: "male" | "female" | null; probability?: number }
        if (body.gender) {
          return {
            gender: body.gender,
            evidence: `First name “${first}” — genderize.io ${Math.round((body.probability ?? 0) * 100)}%`,
            sourceUrl: `https://api.genderize.io/?name=${encodeURIComponent(first)}`,
            ms: Date.now() - started,
          }
        }
      }
    } catch {
      // keep the unknown answer
    }
  }
  return { gender: "unknown", evidence: "No confident source found", sourceUrl: "https://en.wikipedia.org/", ms: Date.now() - started }
}

const SEASONS = {
  male: ["spring-2027-menswear", "fall-2026-menswear", "spring-2026-menswear"],
  female: ["spring-2027-ready-to-wear", "fall-2026-ready-to-wear", "spring-2026-ready-to-wear"],
  unknown: ["spring-2027-ready-to-wear", "spring-2027-menswear"],
} as const

const SEASON_LABEL: Record<string, string> = {
  spring: "Spring",
  fall: "Fall",
  resort: "Resort",
  "pre-fall": "Pre-Fall",
}

function seasonLabel(season: string): string {
  const match = season.match(/^([a-z-]+)-(\d{4})-(.+)$/)
  if (!match) return season
  const [, part, year, kind] = match
  return `${SEASON_LABEL[part] ?? part} ${year} ${kind.replace(/-/g, " ")}`
}

/** Designer slugs on a season page, in the order Vogue lists them. */
async function seasonSlugs(season: string): Promise<string[]> {
  const cached = indexCache.get(season)
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.slugs
  const res = await get(`https://www.vogue.com/fashion-shows/${season}`)
  if (!res.ok) return []
  const html = await res.text()
  const slugs: string[] = []
  const re = new RegExp(`/fashion-shows/${season}/([a-z0-9-]+)`, "g")
  for (const match of html.matchAll(re)) {
    const slug = match[1]
    if (!slugs.includes(slug)) slugs.push(slug)
  }
  indexCache.set(season, { at: Date.now(), slugs })
  return slugs
}

/** Preferred order: houses the client's own record names, then the rest of the season. */
function brandSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function preferredSlugs(): Set<string> {
  const evidence = (studied as { evidence?: { brand: string }[] }).evidence ?? []
  return new Set(evidence.map((row) => brandSlug(row.brand)))
}

function brandFromSlug(slug: string): string {
  return slug
    .split("-")
    .map((part) => (part.length <= 2 ? part.toUpperCase() : part[0].toUpperCase() + part.slice(1)))
    .join(" ")
}

function brandFromTitle(title: string, slug: string): string {
  const cleaned = title.split("|")[0].replace(/Collection.*$/i, "").trim()
  const stripped = cleaned.replace(/\s+(Spring|Fall|Resort|Pre-Fall|Cruise)\s+\d{4}.*$/i, "").trim()
  return stripped || brandFromSlug(slug)
}

const LOOK_RE =
  /https:\/\/assets\.vogue\.com\/photos\/[a-z0-9]+\/master\/w_(?:1280|2560)[^" ]*?\/(\d{5})-([a-z0-9-]+?)-credit-[a-z0-9-]+\.jpg/g

/** One designer's collection: title, eight looks to show, six more to refill from. */
async function readDesigner(season: string, slug: string): Promise<CachedDesigner | null> {
  const key = `${season}/${slug}`
  const cached = designerCache.get(key)
  if (cached) return cached
  const slideshowUrl = `https://www.vogue.com/fashion-shows/${season}/${slug}/slideshow/collection`
  const started = Date.now()
  const res = await get(slideshowUrl)
  if (!res.ok) return null
  const html = (await res.text()).replace(/\\u002F/g, "/")
  const title = (html.match(/<title>([^<]+)<\/title>/) || [])[1] ?? ""
  const seen = new Map<number, string>()
  for (const match of html.matchAll(LOOK_RE)) {
    if (/detail/.test(match[0])) continue
    const lookNo = Number(match[1])
    if (!seen.has(lookNo)) {
      seen.set(lookNo, match[0].replace(/w_(1280|2560)/, "w_1280").replace(/w_1280,/, "w_1280%2C"))
    }
  }
  const looks = [...seen.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([lookNo, image]) => ({ lookNo, image }))
  if (!looks.length) return null
  const designer: CachedDesigner = {
    brand: brandFromTitle(title, slug),
    looks,
    ms: Date.now() - started,
  }
  designerCache.set(key, designer)
  return designer
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let cursor = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++
        out[index] = await fn(items[index], index)
      }
    }),
  )
  return out
}

export async function POST(request: Request) {
  const started = Date.now()
  const body = (await request.json().catch(() => ({}))) as { clientName?: string; offset?: number; limit?: number }
  const clientName = (body.clientName ?? "").trim()
  if (!clientName) return NextResponse.json({ error: "A client name is required." }, { status: 400 })
  const offset = Math.max(0, Math.min(MAX_DESIGNERS, Number(body.offset) || 0))
  const limit = Math.max(1, Math.min(30, Number(body.limit) || 10))

  const trace: AgentStep[] = []
  const at = () => new Date().toISOString()

  // 1 · who is the client
  const gender = await resolveGender(clientName)
  trace.push({
    id: "suggest.search",
    tool: "web.search",
    status: "ok",
    args: { query: clientName, sources: ["Wikipedia", "genderize.io"] },
    result: { gender: gender.gender, evidence: gender.evidence },
    durationMs: gender.ms,
    at: at(),
  })

  // 2 · the season that matches them
  let season = ""
  let slugs: string[] = []
  for (const candidate of SEASONS[gender.gender]) {
    const found = await seasonSlugs(candidate)
    if (found.length) {
      season = candidate
      slugs = found
      break
    }
  }
  if (!season) return NextResponse.json({ error: "Vogue Runway returned no season for that client." }, { status: 502 })
  trace.push({
    id: "suggest.season",
    tool: "vogue.season",
    status: "ok",
    args: { gender: gender.gender, season },
    result: { designers: slugs.length, url: `https://www.vogue.com/fashion-shows/${season}` },
    durationMs: Date.now() - started,
    at: at(),
  })

  // 3 · the designers on this slice — the client's own houses first, then the season's order
  const preferred = preferredSlugs()
  const ordered = [...slugs].sort((a, b) => Number(preferred.has(b)) - Number(preferred.has(a)))
  const picked = ordered.slice(offset, offset + limit)
  const crawlStarted = Date.now()
  const results = await mapLimit(picked, 4, async (slug) => {
    try {
      const designer = await readDesigner(season, slug)
      return designer ? { slug, ...designer } : null
    } catch {
      return null
    }
  })
  const designers: Designer[] = results
    .filter((result): result is NonNullable<typeof result> => Boolean(result))
    .map((result) => ({
      brand: result.brand,
      slug: result.slug,
      season: seasonLabel(season),
      collectionUrl: `https://www.vogue.com/fashion-shows/${season}/${result.slug}`,
      slideshowUrl: `https://www.vogue.com/fashion-shows/${season}/${result.slug}/slideshow/collection`,
      looks: result.looks.slice(0, SHOWN_PER_DESIGNER),
      reserve: result.looks.slice(SHOWN_PER_DESIGNER, SHOWN_PER_DESIGNER + RESERVE_PER_DESIGNER),
    }))
  designers.forEach((designer) => {
    trace.push({
      id: `suggest.runway.${designer.slug}`,
      tool: "vogue.runway",
      status: "ok",
      args: { brand: designer.brand, season, url: designer.slideshowUrl },
      result: { shown: designer.looks.length, reserve: designer.reserve.length },
      durationMs: results.find((result) => result?.slug === designer.slug)?.ms ?? 0,
      at: at(),
    })
  })

  trace.push({
    id: "suggest.pick",
    tool: "looks.pick",
    status: "ok",
    args: { perDesigner: SHOWN_PER_DESIGNER, reserve: RESERVE_PER_DESIGNER, slugCount: designers.length },
    result: { designers: designers.length, looks: designers.reduce((n, d) => n + d.looks.length, 0) },
    durationMs: Date.now() - crawlStarted,
    at: at(),
  })

  return NextResponse.json({
    clientName,
    gender: { value: gender.gender, evidence: gender.evidence, sourceUrl: gender.sourceUrl },
    season: { slug: season, label: seasonLabel(season), url: `https://www.vogue.com/fashion-shows/${season}` },
    designers,
    trace,
    hasMore: offset + picked.length < slugs.length,
    nextOffset: offset + picked.length,
    totalDesigners: Math.min(slugs.length, MAX_DESIGNERS),
  })
}
