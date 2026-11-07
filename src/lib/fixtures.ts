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

/**
 * The crawled menswear set, as board looks.
 *
 * Shared by the board surface and the client page so both show the same 30
 * looks: a house at a time, five per house, capped at the demo's size.
 */
export function seededLooks(cap = CAP): Look[] {
  const path = join(process.cwd(), "public", "fixtures", "menswear", "manifest.json")
  const manifest = JSON.parse(readFileSync(path, "utf8")) as { assets?: FixtureRow[] }
  const all = manifest.assets ?? []

  const byBrand = new Map<string, FixtureRow[]>()
  for (const row of all) {
    const list = byBrand.get(row.brand) ?? []
    if (list.length < PER_HOUSE) list.push(row)
    byBrand.set(row.brand, list)
  }

  return [...byBrand.values()]
    .flat()
    .slice(0, cap)
    .map((row) => ({
      id: row.file,
      fileName: row.file,
      brand: row.brand,
      lookNo: row.lookNo,
      season: row.season,
      suggested: true,
      source: `/fixtures/menswear/${encodeURIComponent(row.file)}`,
      status: "ready" as const,
      src: `/fixtures/menswear/${encodeURIComponent(row.file)}`,
    }))
}
