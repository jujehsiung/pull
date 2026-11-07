import Link from "next/link"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { LookMarquee } from "@/components/LookMarquee"
import { StartJobFlow } from "@/components/start-job/StartJobFlow"
import { SiteMenu } from "@/components/SiteMenu"

interface SuggestionRow {
  file: string
  brand: string
}

/** One look per house for the strip under the fold. */
function stripImages(): string[] {
  try {
    const path = join(process.cwd(), "public", "fixtures", "menswear", "manifest.json")
    const manifest = JSON.parse(readFileSync(path, "utf8")) as { assets?: SuggestionRow[] }
    const seen = new Map<string, number>()
    const picks: string[] = []
    for (const row of manifest.assets ?? []) {
      const used = seen.get(row.brand) ?? 0
      if (used >= 2) continue // two per house keeps the loop varied
      seen.set(row.brand, used + 1)
      picks.push(`/fixtures/menswear/${encodeURIComponent(row.file)}`)
      if (picks.length === 12) break
    }
    return picks
  } catch {
    return []
  }
}

/**
 * Landing.
 *
 * Visual direction: vende.framer.media for the type (a display scale that runs
 * past 120px, tight negative tracking, near-black on near-white, one accent) and
 * Dover Street Market for the density (a full-bleed, square-cornered image band,
 * hairline rules, uppercase labels doing the small work). No radius anywhere —
 * thumbnails and buttons are square.
 */
export default function LandingPage() {
  const strip = stripImages()

  return (
    <>
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between px-6 py-3 md:px-10">
          <Link
            href="/"
            className="text-[19px] font-extrabold tracking-[0.01em] text-foreground"
          >
            PULL.
          </Link>
          <SiteMenu />
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-[1440px] px-6 pt-14 md:px-10 md:pt-20">
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            Sample trafficking
          </p>

          <h1 className="mt-8 text-[clamp(52px,8.6vw,128px)] font-bold leading-[0.88] tracking-[-0.06em] text-foreground">
            From screenshots to signed-off looks.
          </h1>

          {/* The action sits above the rule; the rule introduces the note. */}
          <div className="mt-10">
            <StartJobFlow kind="hero" />
          </div>

          <div className="mt-10 border-t border-border pt-6">
            <p className="max-w-[380px] text-[15px] leading-relaxed text-muted-foreground">
              PULL reads every look, builds the boards, and sends your client one link to approve.
            </p>
          </div>
        </section>

        {/* Endless strip: the clothes are the argument, the chrome is hairline.
            Grab it and slide it; the side gutters are blur filters pinned over the
            band, not empty margins — a look leaves the frame out of focus. */}
        {strip.length ? (
          <LookMarquee srcs={strip} className="mt-16 border-t border-border md:mt-24" />
        ) : null}

        <footer className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-6 py-10 md:px-10">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Real labels · Real email · No client login
          </p>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            New York
          </p>
        </footer>
      </main>
    </>
  )
}
