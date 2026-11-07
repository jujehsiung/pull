/**
 * /board — the review board, opened directly.
 *
 * This is the iteration surface: the same component the start-job dialog hands
 * off to, seeded with the crawled menswear looks and already "ready", so the
 * board can be looked at without filling in a form, picking a folder and waiting
 * for the crop.
 *
 * It renders the REAL board component, not a mock — layout, spacing and type
 * changes here are what the demo will show. The board runs in `page` chrome, so
 * it sits under the site header (app/(site)/layout.tsx) instead of covering it.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { BoardPreview, type PreviewBoard } from "@/components/start-job/BoardPreview"
import type { Look } from "@/components/start-job/ReviewBoard"

interface SuggestionRow {
  file: string
  brand: string
  lookNo: number
  season: string
}

const PER_HOUSE = 5
const CAP = 30

function seededLooks(): Look[] {
  const path = join(process.cwd(), "public", "fixtures", "menswear", "manifest.json")
  const manifest = JSON.parse(readFileSync(path, "utf8")) as { assets?: SuggestionRow[] }
  const all = manifest.assets ?? []

  // Same spread the dialog uses: a house at a time, then the next.
  const byBrand = new Map<string, SuggestionRow[]>()
  for (const row of all) {
    const list = byBrand.get(row.brand) ?? []
    if (list.length < PER_HOUSE) list.push(row)
    byBrand.set(row.brand, list)
  }

  return [...byBrand.values()]
    .flat()
    .slice(0, CAP)
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

export default function BoardPreviewPage() {
  const looks = seededLooks()

  // Three seeded boards so the switcher has somewhere to go. In the studio this
  // list is the stylist's jobs; here the looks are sliced out of one fixture set.
  const boards: PreviewBoard[] = [
    {
      id: "dune-tour",
      job: {
        title: "Dune Tour",
        description: "Timothée Chalamet",
        email: "agent@example.com",
        dueDate: "2027-12-01",
      },
      looks,
    },
    {
      id: "oscar-campaign",
      job: {
        title: "Oscar campaign",
        description: "Zendaya",
        email: "agent@example.com",
        dueDate: "2028-02-15",
      },
      looks: looks.slice(10, 20),
    },
    {
      id: "milan-fittings",
      job: {
        title: "Milan fittings",
        description: "Harris Dickinson",
        email: "agent@example.com",
        dueDate: "2027-09-10",
      },
      looks: looks.slice(20),
    },
  ]

  return <BoardPreview boards={boards} />
}
