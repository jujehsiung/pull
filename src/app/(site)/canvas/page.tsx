import { readFileSync } from "node:fs"
import { join } from "node:path"

import { StudioCanvas } from "@/components/studio-canvas/StudioCanvas"

export const metadata = { title: "Pull — studio" }

interface FixtureRow {
  file: string
}

/** The studio's walls, from the same fixtures the boards use. */
function wallImages(limit = 12): string[] {
  try {
    const path = join(process.cwd(), "public", "fixtures", "menswear", "manifest.json")
    const manifest = JSON.parse(readFileSync(path, "utf8")) as { assets?: FixtureRow[] }
    return (manifest.assets ?? [])
      .slice(0, limit)
      .map((row) => `/fixtures/menswear/${encodeURIComponent(row.file)}`)
  } catch {
    return []
  }
}

/**
 * The studio — a node graph for making a look.
 *
 * A design surface (no session, no provider): the graph, the run and the assets
 * panel are real interactions, the images are sample output. It becomes
 * `/studio/canvas` when the Clerk workspace lands.
 */
export default function StudioPage() {
  const images = wallImages()

  return (
    <main>
      <StudioCanvas
        uploadImage={images[0] ?? ""}
        sampleAssets={images.slice(1, 5)}
        references={images.slice(0, 12)}
      />
    </main>
  )
}
