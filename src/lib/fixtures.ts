import { readFileSync } from "node:fs"
import { join } from "node:path"

import type { Look } from "@/components/start-job/ReviewBoard"

/** One row of `public/fixtures/menswear/manifest.json`. */
export interface FixtureRow {
  file: string
  brand: string
  lookNo: number
  season: string
}

const PER_HOUSE = 5
const CAP = 30

function manifestRows(): FixtureRow[] {
  const path = join(process.cwd(), "public", "fixtures", "menswear", "manifest.json")
  const manifest = JSON.parse(readFileSync(path, "utf8")) as { assets?: FixtureRow[] }
  return manifest.assets ?? []
}

function asLook(row: FixtureRow): Look {
  return {
    id: row.file,
    fileName: row.file,
    brand: row.brand,
    lookNo: row.lookNo,
    season: row.season,
    suggested: true,
    source: `/fixtures/menswear/${encodeURIComponent(row.file)}`,
    status: "ready" as const,
    src: `/fixtures/menswear/${encodeURIComponent(row.file)}`,
  }
}

/**
 * The crawled menswear set, as board looks.
 *
 * Shared by the board surface and the client page so both show the same 30
 * looks: a house at a time, five per house, capped at the demo's size.
 */
export function seededLooks(cap = CAP): Look[] {
  const byBrand = new Map<string, FixtureRow[]>()
  for (const row of manifestRows()) {
    const list = byBrand.get(row.brand) ?? []
    if (list.length < PER_HOUSE) list.push(row)
    byBrand.set(row.brand, list)
  }

  return [...byBrand.values()].flat().slice(0, cap).map(asLook)
}

/**
 * The looks a board has not shown yet, per house — what a deleted tile is replaced with so the
 * row keeps its five. Keyed by brand; each look is a ready fixture, so a replacement needs no
 * ingest run.
 */
export function seededReserve(shown: Look[], perBrand = PER_HOUSE): Record<string, Look[]> {
  const taken = new Set(shown.map((look) => look.fileName))
  const reserve: Record<string, Look[]> = {}
  for (const row of manifestRows()) {
    if (taken.has(row.file)) continue
    const list = reserve[row.brand] ?? []
    if (list.length < perBrand) list.push(asLook(row))
    reserve[row.brand] = list
  }
  return reserve
}
