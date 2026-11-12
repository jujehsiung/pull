/**
 * The client record — what the stylist knows about the person, not just their gender.
 *
 * Research drafts it from Vogue's own search and article pages (with the sources kept), and the
 * stylist corrects it in the job form: brands worn, brands to avoid, the register. Those corrections
 * are the record's source of truth; the draft only saves typing.
 *
 * This file holds the vocabulary both sides share, so the form and the route cannot drift.
 */
import type { Register } from "./occasion"

export type Presentation = "unknown" | "menswear" | "womenswear" | "both"

export const PRESENTATION_OPTIONS: { value: Presentation; label: string }[] = [
  { value: "unknown", label: "Not sure" },
  { value: "menswear", label: "Menswear" },
  { value: "womenswear", label: "Womenswear" },
  { value: "both", label: "Both" },
]

/** The registers a stylist can pick when research returns nothing. */
export const REGISTER_OPTIONS: { value: Register; label: string }[] = [
  { value: "tailoring", label: "Tailoring" },
  { value: "soft-tailoring", label: "Soft tailoring" },
  { value: "evening", label: "Evening" },
  { value: "minimal", label: "Minimal" },
  { value: "romantic", label: "Romantic" },
  { value: "street", label: "Street" },
  { value: "avant-garde", label: "Avant-garde" },
  { value: "casual", label: "Casual" },
]

export interface ClientBrand {
  brand: string
  /** One line of evidence from the research, e.g. "custom Prada at the 2025 premiere". */
  note?: string
}

export interface ClientRecordDraft {
  presentation: Presentation
  brandsWorn: ClientBrand[]
  registers: Register[]
  silhouettes: string[]
  notes: string
}

export interface ClientRecordSource {
  label: string
  url: string
}

/** What the form sends the skill: the stylist's corrected record, plus the brief. */
export interface ClientRecordInput {
  brandsWorn: string[]
  brandsAvoid: string[]
  registers: string[]
  silhouettes: string[]
  notes?: string
}

/**
 * Brief language → the house registers it implies. The brief is free text, so this is a small,
 * legible keyword map rather than a model: "sharp black tailoring, no logos" reads as tailoring +
 * minimal, and nothing else changes.
 */
const KEYWORD_REGISTERS: { match: RegExp; registers: Register[] }[] = [
  { match: /\b(tailor|suit|sharp|structured|shoulder)\w*/i, registers: ["tailoring"] },
  { match: /\b(soft|relaxed|unstructured|slouch)\w*/i, registers: ["soft-tailoring"] },
  { match: /\b(minimal|clean|quiet|understated|no logo)\w*/i, registers: ["minimal"] },
  { match: /\b(monochrome|black|all[- ]black)\b/i, registers: ["monochrome"] },
  { match: /\b(evening|black tie|tuxedo|gown|formal)\w*/i, registers: ["evening"] },
  { match: /\b(glamour|glam|dramatic|carpet)\w*/i, registers: ["glamour", "evening"] },
  { match: /\b(romantic|floor[- ]length|flow(ing|y)|lace|ruffle)\w*/i, registers: ["romantic"] },
  { match: /\b(avant|experimental|conceptual|sculptural|surreal)\w*/i, registers: ["avant-garde", "concept"] },
  { match: /\b(texture|textured|craft|embroider|bead)\w*/i, registers: ["texture", "craft"] },
  { match: /\b(oversized|volume|voluminous|boxy)\w*/i, registers: ["dramatic", "street"] },
  { match: /\b(utility|workwear|cargo)\w*/i, registers: ["utility"] },
  { match: /\b(street|sneaker|logo|hype)\w*/i, registers: ["street"] },
  { match: /\b(denim|jeans)\w*/i, registers: ["denim"] },
  { match: /\b(knit|sweater|wool)\w*/i, registers: ["knitwear"] },
  { match: /\b(leather|biker|chrome)\w*/i, registers: ["leather"] },
  { match: /\b(sport|athletic|technical)\w*/i, registers: ["sport"] },
  { match: /\b(heritage|classic|traditional|preppy)\w*/i, registers: ["heritage", "classic"] },
  { match: /\b(party|sequin|nightlife|club)\w*/i, registers: ["party"] },
]

/** Registers implied by a style brief or the researched silhouettes. */
export function registersFromText(...texts: (string | undefined)[]): Register[] {
  const haystack = texts.filter(Boolean).join(" ")
  if (!haystack) return []
  const found = new Set<Register>()
  for (const { match, registers } of KEYWORD_REGISTERS) {
    if (!match.test(haystack)) continue
    for (const register of registers) found.add(register)
  }
  return [...found]
}

/** "Prada, Givenchy, Tom Ford" → ["Prada", "Givenchy", "Tom Ford"]. */
export function splitBrands(value: string): string[] {
  return value
    .split(/[,;\n]/)
    .map((brand) => brand.trim())
    .filter(Boolean)
    .slice(0, 40)
}

export function brandNames(brands: ClientBrand[] | string[]): string[] {
  return brands.map((brand) => (typeof brand === "string" ? brand : brand.brand)).filter(Boolean)
}

/** A record with nothing in it — the shape the route returns when research finds no evidence. */
export const EMPTY_RECORD: ClientRecordDraft = {
  presentation: "unknown",
  brandsWorn: [],
  registers: [],
  silhouettes: [],
  notes: "",
}
