/**
 * Look-label parsing — the deterministic half of Act 1 (PRD FR-4, §7 steps 3–4).
 *
 * The screenshot prints its own caption ("Look 27 — AW26", "CELINE - runway") and usually its URL
 * ("vogue.com/runway/celine"). OCR reads that text; this module turns it into a look number,
 * season and brand, falling back to the filename and then to the file's sequence number.
 *
 * Pure and dependency-free on purpose: the browser parses with it, `scripts/ocr-check.mjs` parses
 * with it in Node, and the batch route only validates what comes back. Same function, same answer.
 *
 * `readSource` says where the look NUMBER came from — the grain of truth FR-4 asks the stylist to
 * see ("9 read from the image, 1 from filename"). `confidence` is a deterministic 0–1 estimate of
 * how much of the triple was actually read (not OCR's own 0–100 confidence, which the browser
 * reports separately).
 */

export type ImportReadSource = "image" | "filename" | "sequence"

export interface ParsedLook {
  /** 1–999. Never 0: a missing look number falls back to the file's sequence position. */
  lookNo: number
  /** "AW26" / "SS25" / "RESORT26" … or null when nothing readable carries a season. */
  season: string | null
  /** A display name ("Celine", "Bottega Veneta") or "Unassigned". */
  brand: string
  /** 0–1, deterministic. */
  confidence: number
  /** Where the look number came from. */
  readSource: ImportReadSource
}

/**
 * "AW26" / "SS25" / "FW25" / "Fall 2025" / "Resort 26". Also tolerates the separators OCR
 * randomly emits: `AW-26`, `SS/25`, `AW’26`.
 */
const SEASON_PART = String.raw`\b(spring\s*[\/&]\s*summer|fall\s*[\/&]\s*winter|aw|fw|ss|pf|resort|cruise|spring|summer|fall|winter)\s*['’]?\s*[-–—/]?\s*(\d{2,4})\b`
const SEASON_RE = new RegExp(SEASON_PART, "i")
const SEASON_RE_G = new RegExp(SEASON_PART, "gi")

/**
 * "Look 27", "Look #27", "LOOK 27 — AW26", "look no. 27". The negative lookahead stops
 * "Look 2026" from being read as look 202.
 */
const LOOK_RES = [
  /\blook\s*(?:no\.?|number|#)?\s*[:#.\-–—]?\s*(\d{1,3})(?!\d)/i,
  /\b(?:runway|look|style)\s*[#:.\-–—]?\s*(\d{1,3})(?!\d)/i,
]

/** `CELINE - runway`, `BOTTEGA VENETA · look 12`, `PRADA — campaign`. */
const BRAND_CAPTION_RE =
  /^\s*([A-Z][A-Z0-9&.'’()\- ]{1,39}?)\s*[-–—·•|~]\s*(?:runway|look|campaign|show|collection|presentation|ready[\s-]*to[\s-]*wear)\b/i

/** A bare all-caps line is probably the house: `CELINE`, `BOTTEGA VENETA`. */
const BRAND_CAPS_RE = /^\s*([A-Z][A-Z0-9&.'’()\-]*(?:\s+[A-Z0-9&.'’()\-]+){0,3})\s*$/

/** `vogue.com/runway/celine`, and OCR's favourite misread `vogue.comirunway/prada`. */
const BRAND_URL_RE = /(?:runway|fashion[\s-]*shows?|collections?|shows?)\s*[\/|]\s*([a-z][a-z0-9-]{1,40})/i

const CAPS_NOISE = /^(?:LOOK|LOOKS|RUNWAY|SHOW|COLLECTION|SIZE|PRICE|USD|EUR|GBP|NEW|SALE|SHOP|VIEW|IMAGE|PHOTO|SCREENSHOT)$/i

const FILENAME_NOISE = new Set([
  "look",
  "looks",
  "runway",
  "show",
  "screenshot",
  "screen",
  "shot",
  "image",
  "photo",
  "picture",
  "img",
  "pic",
  "copy",
  "final",
  "edit",
  "download",
  "file",
  "png",
  "jpg",
  "jpeg",
  "webp",
])

/** Canonical display names, keyed by a normalised slug. Unknown houses fall back to title case. */
const BRAND_ALIASES: Record<string, string> = {
  celine: "Celine",
  "bottega-veneta": "Bottega Veneta",
  bottega: "Bottega Veneta",
  "jil-sander": "Jil Sander",
  jilsander: "Jil Sander",
  lemaire: "Lemaire",
  prada: "Prada",
  "miu-miu": "Miu Miu",
  "saint-laurent": "Saint Laurent",
  ysl: "Saint Laurent",
  "louis-vuitton": "Louis Vuitton",
  "the-row": "The Row",
  "dolce-gabbana": "Dolce Gabbana",
  "marc-jacobs": "Marc Jacobs",
  "alexander-mcqueen": "Alexander McQueen",
  "balenciaga": "Balenciaga",
  "loewe": "Loewe",
  "chloe": "Chloe",
  "acne-studios": "Acne Studios",
  "commission": "Commission",
  "toteme": "Toteme",
}

function readLookNo(text: string): number | null {
  for (const re of LOOK_RES) {
    const match = re.exec(text)
    if (match) {
      const value = Number(match[1])
      if (Number.isInteger(value) && value >= 1 && value <= 999) return value
    }
  }
  return null
}

function readSeason(text: string): string | null {
  const match = SEASON_RE.exec(text)
  if (!match) return null
  return normaliseSeason(match[1], match[2])
}

/** Turn a season token into the short form the board uses ("AW26"). Exported for reuse in UI/scripts. */
export function normaliseSeason(token: string, year: string): string {
  const key = token.toUpperCase().replace(/\s+/g, " ").trim()
  const code =
    key === "SPRING/SUMMER" || key === "SPRING & SUMMER" || key === "SPRING" || key === "SUMMER"
      ? "SS"
      : key === "FALL/WINTER" || key === "FALL & WINTER" || key === "FALL" || key === "WINTER" || key === "FW"
        ? "AW"
        : key === "CRUISE"
          ? "RESORT"
          : key
  const shortYear = year.length === 4 ? year.slice(2) : year
  return `${code}${shortYear}`
}

export function titleCase(value: string): string {
  return value.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
}

/** Normalise a brand surface form to one display name so boards never split "celine"/"CELINE". */
export function canonicalBrand(raw: string): string {
  const cleaned = raw.replace(/[_]+/g, " ").replace(/\s+/g, " ").trim()
  if (!cleaned) return "Unassigned"
  const key = cleaned
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
  if (key && BRAND_ALIASES[key]) return BRAND_ALIASES[key]
  return titleCase(cleaned.replace(/[-–—]+/g, " "))
}

function brandFromText(text: string): string {
  if (!text) return ""

  // 1. The URL in the browser chrome names the house unambiguously.
  const urlMatch = BRAND_URL_RE.exec(text)
  if (urlMatch) {
    const slug = urlMatch[1].replace(/[-_]+/g, " ").trim()
    if (slug && slug.length >= 2) return canonicalBrand(slug)
  }

  // 2. The caption line: `CELINE - runway`.
  for (const line of text.split(/\r?\n/)) {
    const match = BRAND_CAPTION_RE.exec(line)
    if (match) {
      const brand = canonicalBrand(match[1])
      if (brand && brand !== "Unassigned") return brand
    }
  }

  // 3. A bare all-caps line: `BOTTEGA VENETA`.
  for (const line of text.split(/\r?\n/)) {
    const match = BRAND_CAPS_RE.exec(line)
    if (!match) continue
    const candidate = match[1].replace(/\s+/g, " ").trim()
    if (candidate.length < 2 || /\d/.test(candidate)) continue
    if (candidate.trim().split(" ").some((word) => CAPS_NOISE.test(word))) continue
    const brand = canonicalBrand(candidate)
    if (brand && brand !== "Unassigned") return brand
  }

  return ""
}

function brandFromFilename(filename: string): string {
  const base = filename.replace(/\.[a-z0-9]{1,6}$/i, "")
  let cleaned = base.replace(/[_\-–—.]+/g, " ").replace(/\s+/g, " ").trim()
  cleaned = cleaned
    .replace(SEASON_RE_G, " ")
    .replace(/\blook\s*(?:no\.?|number|#)?\s*[:#.\-–—]?\s*\d{1,3}(?!\d)/gi, " ")
    .replace(/#\s*\d{1,3}/g, " ")
    .replace(/\b\d{4}[-_ ]?\d{2}[-_ ]?\d{2}\b/g, " ")
    .replace(/\b(?:screenshot|screen shot|photo|image|picture|img|pic|copy|final|edit|download|file)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()

  const words = cleaned
    .split(/\s+/)
    .map((word) => word.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, ""))
    .filter((word) => word.length > 1 && /[a-z]/i.test(word))
    .filter((word) => !FILENAME_NOISE.has(word.toLowerCase()))

  if (words.length === 0) return ""
  // Two words is the right shot for the houses in the demo ("bottega veneta", "jil sander").
  const brand = canonicalBrand(words.slice(0, 2).join(" "))
  return brand === "Unassigned" ? "" : brand
}

function clampSequence(sequence: number): number {
  if (!Number.isFinite(sequence)) return 1
  return Math.min(999, Math.max(1, Math.floor(sequence)))
}

/**
 * Parse one look label.
 *
 * @param ocrText  text tesseract read off the screenshot (possibly empty when OCR failed)
 * @param filename the uploaded file's name — the fallback every screenshot folder carries
 * @param sequence 1-based position in the drop, used only when neither image nor name has a number
 */
export function parseLook(ocrText: string, filename: string, sequence: number): ParsedLook {
  const text = typeof ocrText === "string" ? ocrText : ""
  const name = typeof filename === "string" ? filename : ""
  // Screenshot folders use `celine_look_27_aw26.png`; `_` is a word character, so normalise the
  // separators before asking the same regexes about the name.
  const fileText = name.replace(/[_\-–—.]+/g, " ")

  // The look number is the field allowed to disagree with the filename; the image wins when it can.
  const imageLook = readLookNo(text)
  const fileLook = readLookNo(fileText)
  const lookNo = imageLook ?? fileLook ?? clampSequence(sequence)
  const readSource: ImportReadSource =
    imageLook !== null ? "image" : fileLook !== null ? "filename" : "sequence"

  const imageSeason = readSeason(text)
  const fileSeason = imageSeason ? null : readSeason(fileText)
  const season = imageSeason ?? fileSeason ?? null

  const imageBrand = brandFromText(text)
  const fileBrand = imageBrand ? "" : brandFromFilename(name)
  const brand = canonicalBrand(imageBrand || fileBrand || "Unassigned") || "Unassigned"

  // Deterministic confidence: base by provenance, then small credit for each field we actually read.
  let confidence = readSource === "image" ? 0.92 : readSource === "filename" ? 0.64 : 0.32
  confidence += imageSeason ? 0.04 : season ? 0.01 : 0
  confidence += imageBrand ? 0.03 : fileBrand ? 0.01 : 0
  confidence = Math.min(0.99, Math.round(confidence * 100) / 100)

  return { lookNo, season, brand, confidence, readSource }
}
