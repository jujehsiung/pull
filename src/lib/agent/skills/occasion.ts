/**
 * The occasion — what the looks are being pulled for.
 *
 * The suggest-looks skill used to sort every client by one frozen Timothée Chalamet record, so two
 * different clients of the same gender received the same houses in the same order. An occasion is
 * the first job-level signal the skill can actually read: a red-carpet pull wants evening tailoring,
 * a personal pull wants denim and soft tailoring, and the houses that serve them are different.
 *
 * Each house below is tagged with a formality tier (1 casual … 5 formal) and the registers it reads
 * as. The occasion names a target tier and the registers it wants; the ranker scores every house the
 * runway season actually carries, so a house that is not showing this season simply drops out.
 *
 * This is deliberately a curation, not a model: it is small, explainable, and every ordering change
 * is a line in this file. It is also the seam where a client's own record (brands worn, style notes)
 * will plug in later — the score function is the only thing that has to change.
 */

export type OccasionKey = "red-carpet" | "editorial" | "music-video" | "commercial" | "personal"

export type Register =
  | "evening"
  | "glamour"
  | "tailoring"
  | "heritage"
  | "romantic"
  | "minimal"
  | "concept"
  | "avant-garde"
  | "texture"
  | "art"
  | "street"
  | "party"
  | "leather"
  | "sport"
  | "polish"
  | "classic"
  | "casual"
  | "denim"
  | "knitwear"
  | "soft-tailoring"
  | "utility"
  | "deconstructed"
  | "monochrome"
  | "dramatic"
  | "craft"
  | "hybrid"
  | "surreal"
  | "rock"
  | "luxury"

export interface OccasionProfile {
  key: OccasionKey
  /** Sentence case, as the form shows it. */
  label: string
  /** 1 casual … 5 formal. */
  formality: 1 | 2 | 3 | 4 | 5
  /** The registers this occasion asks for. */
  registers: Register[]
}

/**
 * Red carpet is the most formal, personal the most casual. Editorial, music video and commercial
 * sit in the middle but ask for different registers, which is what keeps their boards apart.
 */
export const OCCASIONS: Record<OccasionKey, OccasionProfile> = {
  "red-carpet": {
    key: "red-carpet",
    label: "Red carpet",
    formality: 5,
    registers: ["evening", "glamour", "tailoring", "heritage"],
  },
  editorial: {
    key: "editorial",
    label: "Editorial",
    formality: 3,
    registers: ["concept", "avant-garde", "texture", "romantic", "art"],
  },
  "music-video": {
    key: "music-video",
    label: "Music video",
    formality: 3,
    registers: ["street", "party", "leather", "sport", "concept"],
  },
  commercial: {
    key: "commercial",
    label: "Commercial",
    formality: 3,
    registers: ["polish", "classic", "minimal", "sport", "heritage"],
  },
  personal: {
    key: "personal",
    label: "Personal",
    formality: 2,
    registers: ["casual", "denim", "knitwear", "soft-tailoring", "minimal"],
  },
}

/** Formal → casual, which is also the order the form shows. */
export const OCCASION_OPTIONS: OccasionProfile[] = [
  OCCASIONS["red-carpet"],
  OCCASIONS.editorial,
  OCCASIONS["music-video"],
  OCCASIONS.commercial,
  OCCASIONS.personal,
]

export const DEFAULT_OCCASION: OccasionKey = "red-carpet"

export function isOccasion(value: unknown): value is OccasionKey {
  return typeof value === "string" && value in OCCASIONS
}

export function occasionLabel(value: OccasionKey): string {
  return OCCASIONS[value].label
}

interface House {
  /** Vogue slug(s); a prefix matches the house's menswear/RTW variants. */
  slugs: string[]
  formality: 1 | 2 | 3 | 4 | 5
  registers: Register[]
}

/**
 * The houses the Vogue Runway indexes carry, tagged. The list does not have to be complete: an
 * untagged house scores as mid-formality with no registers, so it can still fill a row but never
 * outranks a house the occasion asked for.
 */
const HOUSES: House[] = [
  // Formal — evening, tailoring, heritage.
  { slugs: ["tom-ford"], formality: 5, registers: ["evening", "glamour", "tailoring", "heritage"] },
  { slugs: ["givenchy"], formality: 5, registers: ["evening", "tailoring", "glamour"] },
  { slugs: ["saint-laurent"], formality: 5, registers: ["evening", "tailoring", "glamour", "rock"] },
  { slugs: ["giorgio-armani"], formality: 5, registers: ["evening", "tailoring", "heritage", "minimal"] },
  { slugs: ["valentino"], formality: 5, registers: ["evening", "romantic", "glamour"] },
  { slugs: ["chanel"], formality: 5, registers: ["evening", "heritage", "romantic", "tailoring"] },
  { slugs: ["alexander-mcqueen"], formality: 5, registers: ["evening", "dramatic", "tailoring"] },
  { slugs: ["dior", "dior-homme", "christian-dior"], formality: 5, registers: ["evening", "tailoring", "romantic", "heritage"] },
  { slugs: ["balmain"], formality: 5, registers: ["evening", "glamour", "party"] },
  { slugs: ["oscar-de-la-renta"], formality: 5, registers: ["evening", "glamour"] },
  { slugs: ["carolina-herrera"], formality: 5, registers: ["evening", "glamour", "heritage"] },
  { slugs: ["dolce-gabbana"], formality: 5, registers: ["evening", "glamour", "tailoring"] },
  { slugs: ["schiaparelli"], formality: 5, registers: ["evening", "art", "surreal"] },
  { slugs: ["fendi"], formality: 5, registers: ["evening", "heritage", "tailoring"] },
  { slugs: ["brioni"], formality: 5, registers: ["evening", "tailoring", "heritage"] },
  { slugs: ["canali"], formality: 5, registers: ["tailoring", "heritage"] },
  { slugs: ["dunhill"], formality: 5, registers: ["tailoring", "heritage"] },
  { slugs: ["max-mara"], formality: 5, registers: ["heritage", "tailoring", "minimal"] },
  { slugs: ["akris"], formality: 5, registers: ["tailoring", "minimal", "heritage"] },
  { slugs: ["khaite"], formality: 5, registers: ["evening", "minimal", "tailoring"] },

  // Polished fashion — the middle tier.
  { slugs: ["celine"], formality: 4, registers: ["minimal", "tailoring", "evening", "rock"] },
  { slugs: ["hermes"], formality: 4, registers: ["heritage", "leather", "minimal"] },
  { slugs: ["bottega-veneta"], formality: 4, registers: ["minimal", "leather", "heritage", "evening"] },
  { slugs: ["loewe"], formality: 4, registers: ["concept", "texture", "heritage", "art"] },
  { slugs: ["prada"], formality: 4, registers: ["concept", "tailoring", "minimal"] },
  { slugs: ["lanvin"], formality: 4, registers: ["evening", "heritage", "tailoring"] },
  { slugs: ["etro"], formality: 4, registers: ["heritage", "texture", "tailoring"] },
  { slugs: ["brunello-cucinelli"], formality: 4, registers: ["heritage", "soft-tailoring", "minimal"] },
  { slugs: ["loro-piana"], formality: 4, registers: ["heritage", "minimal", "luxury"] },
  { slugs: ["burberry"], formality: 4, registers: ["heritage", "tailoring", "classic"] },
  { slugs: ["yohji-yamamoto"], formality: 4, registers: ["avant-garde", "tailoring", "monochrome"] },
  { slugs: ["ann-demeulemeester"], formality: 4, registers: ["avant-garde", "tailoring", "monochrome"] },
  { slugs: ["rick-owens"], formality: 4, registers: ["avant-garde", "leather", "monochrome"] },
  { slugs: ["comme-des-garcons"], formality: 4, registers: ["avant-garde", "concept", "art"] },
  { slugs: ["maison-margiela"], formality: 4, registers: ["concept", "deconstructed", "art"] },
  { slugs: ["jw-anderson"], formality: 4, registers: ["concept", "texture", "romantic"] },
  { slugs: ["dries-van-noten"], formality: 3, registers: ["texture", "romantic", "heritage"] },
  { slugs: ["magliano"], formality: 3, registers: ["concept", "tailoring", "texture"] },
  { slugs: ["sacai"], formality: 3, registers: ["hybrid", "sport", "concept"] },
  { slugs: ["junya-watanabe"], formality: 3, registers: ["concept", "texture"] },

  // Middle — party, street, sport.
  { slugs: ["gucci"], formality: 3, registers: ["party", "glamour", "heritage"] },
  { slugs: ["miu-miu"], formality: 3, registers: ["party", "romantic", "concept"] },
  { slugs: ["balenciaga"], formality: 3, registers: ["street", "concept", "evening"] },
  { slugs: ["jacquemus"], formality: 3, registers: ["romantic", "casual", "glamour"] },
  { slugs: ["chloe"], formality: 3, registers: ["romantic", "soft-tailoring", "heritage"] },
  { slugs: ["cfcl"], formality: 3, registers: ["knitwear", "minimal", "concept"] },
  { slugs: ["feng-chen-wang"], formality: 3, registers: ["street", "concept"] },
  { slugs: ["doublet"], formality: 3, registers: ["concept", "art", "street"] },
  { slugs: ["vetements"], formality: 2, registers: ["street", "deconstructed"] },
  { slugs: ["off-white"], formality: 2, registers: ["street", "leather"] },
  { slugs: ["chrome-hearts"], formality: 2, registers: ["leather", "street", "rock"] },
  { slugs: ["amiri"], formality: 2, registers: ["street", "leather"] },
  { slugs: ["kith"], formality: 2, registers: ["street", "sport"] },
  { slugs: ["kidsuper"], formality: 2, registers: ["art", "street", "concept"] },
  { slugs: ["diesel"], formality: 2, registers: ["denim", "street", "party"] },

  // Casual — the personal tier.
  { slugs: ["lemaire"], formality: 3, registers: ["minimal", "soft-tailoring", "casual"] },
  { slugs: ["jil-sander"], formality: 3, registers: ["minimal", "soft-tailoring", "polish"] },
  { slugs: ["acne-studios"], formality: 2, registers: ["denim", "minimal", "soft-tailoring"] },
  { slugs: ["our-legacy"], formality: 2, registers: ["classic", "casual", "soft-tailoring"] },
  { slugs: ["auralee"], formality: 2, registers: ["minimal", "soft-tailoring", "knitwear"] },
  { slugs: ["isabel-marant"], formality: 2, registers: ["casual", "soft-tailoring", "denim"] },
  { slugs: ["ami"], formality: 2, registers: ["casual", "soft-tailoring", "classic"] },
  { slugs: ["paul-smith"], formality: 2, registers: ["classic", "casual", "heritage"] },
  { slugs: ["hed-mayner"], formality: 2, registers: ["casual", "heritage", "knitwear"] },
  { slugs: ["bode"], formality: 2, registers: ["craft", "heritage", "casual"] },
  { slugs: ["ralph-lauren"], formality: 3, registers: ["heritage", "classic", "casual"] },
  { slugs: ["coach"], formality: 2, registers: ["heritage", "casual"] },
  { slugs: ["lacoste"], formality: 2, registers: ["sport", "casual"] },
  { slugs: ["tommy-hilfiger"], formality: 2, registers: ["sport", "classic"] },
  { slugs: ["calvin-klein-collection"], formality: 3, registers: ["minimal", "sport"] },
]

/** Exact, then longest prefix match, so `dior`/`christian-dior` and `comme-des-garcons-*` resolve. */
function houseFor(slug: string): House | null {
  let best: { house: House; length: number } | null = null
  for (const house of HOUSES) {
    for (const alias of house.slugs) {
      const matches = slug === alias || slug.startsWith(`${alias}-`)
      if (matches && (!best || alias.length > best.length)) best = { house, length: alias.length }
    }
  }
  return best?.house ?? null
}

/** Brand name → slug, so "Dior" reaches dior-homme and "Saint Laurent" reaches saint-laurent. */
function brandSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/** A brand the record names matches a house by any of the house's Vogue aliases. */
function houseMatchesBrand(slug: string, house: House | null, brand: string): boolean {
  const target = brandSlug(brand)
  if (!target) return false
  const aliases = house?.slugs ?? [slug]
  return aliases.some(
    (alias) => alias === target || alias.startsWith(`${target}-`) || target.startsWith(`${alias}-`),
  )
}

/** Stable FNV-1a hash — a tie-break, not randomness: the same client always gets the same order. */
function hash(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** What the client record adds to the occasion's own brief. */
export interface RankingSignals {
  /** Houses the client has worn — boosted so the research shows on the board. */
  brandsWorn?: string[]
  /** Houses to leave off the board entirely. */
  brandsAvoid?: string[]
  /** Registers the record or the style brief adds to the occasion's own. */
  registers?: Register[]
}

export interface HouseScore {
  slug: string
  score: number
  formality: 1 | 2 | 3 | 4 | 5
  registers: Register[]
  /** True when the client's own record names the house. */
  worn: boolean
  /** True when the record says to avoid it — the route drops these. */
  avoided: boolean
}

/**
 * Score every house the season carries, best first. The occasion sets the base; the client's own
 * brands worn are boosted by more than any register tier can earn, because a house the client wears
 * has to appear — then the rest of the board is filled with adjacent houses. Integer scores keep the
 * tiers legible; the seed only orders houses that are already equal, so two clients on the same
 * brief start in different houses.
 */
export function rankHouses(
  slugs: string[],
  occasion: OccasionKey,
  seed: string,
  signals: RankingSignals = {},
): HouseScore[] {
  const profile = OCCASIONS[occasion]
  const wanted = [...new Set([...profile.registers, ...(signals.registers ?? [])])]
  const worn = signals.brandsWorn ?? []
  const avoid = signals.brandsAvoid ?? []

  return slugs
    .map((slug) => {
      const house = houseFor(slug)
      const formality = house?.formality ?? 3
      const registers = house?.registers ?? []
      const formalityFit = 2 * (5 - Math.abs(formality - profile.formality))
      const registerMatches = registers.filter((register) => wanted.includes(register))
      const isWorn = worn.some((brand) => houseMatchesBrand(slug, house, brand))
      const isAvoided = avoid.some((brand) => houseMatchesBrand(slug, house, brand))
      return {
        slug,
        score: formalityFit + registerMatches.length * 3 + (isWorn ? 14 : 0),
        formality,
        registers,
        worn: isWorn,
        avoided: isAvoided,
      }
    })
    .sort((a, b) => {
      if (a.avoided !== b.avoided) return a.avoided ? 1 : -1
      if (b.score !== a.score) return b.score - a.score
      return hash(`${seed}|${occasion}|${a.slug}`) - hash(`${seed}|${occasion}|${b.slug}`)
    })
}
