import { readFileSync } from "node:fs"
import { join } from "node:path"

import { StudioCanvas } from "@/components/studio-canvas/StudioCanvas"

export const metadata = { title: "Pull — studio" }

interface FixtureRow {
  file: string
  brand: string
  lookNo: number
}

function fixture(file: string, rows: FixtureRow[]): string {
  const known = rows.some((row) => row.file === file)
  return known ? `/fixtures/menswear/${encodeURIComponent(file)}` : ""
}

/**
 * The studio — a node graph for making a look.
 *
 * The run is real: the agent reads the marked references, writes the prompt, and
 * `gpt-image-2` renders the look into the assets panel. The four references are
 * fixtures — one client, three garments — from the same crawl the boards use.
 */
export default function StudioPage() {
  let rows: FixtureRow[] = []
  try {
    const manifest = JSON.parse(
      readFileSync(join(process.cwd(), "public", "fixtures", "menswear", "manifest.json"), "utf8"),
    ) as { assets?: FixtureRow[] }
    rows = manifest.assets ?? []
  } catch {
    rows = []
  }

  const refs = [
    { name: "the client", image: fixture("hed_mayner_look_1_aw26.jpg", rows) },
    { name: "outfit 1 · prada", image: fixture("prada_look_1_aw26.jpg", rows) },
    { name: "outfit 2 · dior", image: fixture("dior_homme_look_1_aw26.jpg", rows) },
    { name: "outfit 3 · vuitton", image: fixture("louis_vuitton_look_4_aw26.jpg", rows) },
  ]

  // Anything that is not a wired reference still gives the assets panel something to
  // show if the provider is unreachable.
  const wired = new Set(refs.map((ref) => ref.image))
  const sampleAssets = rows
    .map((row) => `/fixtures/menswear/${encodeURIComponent(row.file)}`)
    .filter((src) => !wired.has(src))
    .slice(0, 4)

  return (
    <main>
      <StudioCanvas refs={refs} sampleAssets={sampleAssets} />
    </main>
  )
}
