import { readFileSync } from "node:fs"
import { join } from "node:path"
import Link from "next/link"

import { AgentTraceReel, type TraceRow } from "@/components/landing/AgentTraceReel"
import { HowItWorks, type HowStep } from "@/components/landing/HowItWorks"
import { Pricing } from "@/components/landing/Pricing"
import { LookMarquee } from "@/components/LookMarquee"
import { StartJobFlow } from "@/components/start-job/StartJobFlow"

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

/** The three moves, each with the real screen it produces. */
const STEPS: HowStep[] = [
  {
    n: "01",
    title: "Read the floor",
    body: "Drop the folder of screenshots. Pull trims the chrome, reads the look number and the season, and files every look under its house.",
    label: "The board — every look, filed by house",
    screen: "/landing/screen-board.png",
    alt: "The board: looks grouped by house, one shortlisted, one in a hairline grid",
  },
  {
    n: "02",
    title: "Send one link",
    body: "Your client opens it with nothing to install and no account. They approve what they love, pass the rest, and circle the pieces they actually want.",
    label: "The client's page — approve, pass, circle",
    screen: "/landing/screen-client.png",
    alt: "The client's page: looks approved, passed and circled with a red pen",
  },
  {
    n: "03",
    title: "Let the requests go",
    body: "The agent drafts one email per showroom with the approved looks and the shoot dates. You approve it and it sends. Boxes, weights and labels follow the same board.",
    label: "Request emails — one per showroom, drafted",
    screen: "/landing/screen-requests.png",
    alt: "Request emails: the agent's run, then one draft per house with the looks and shoot dates",
  },
]

/** Real tool names and durations, as they appear on /trace. */
const TRACE: TraceRow[] = [
  { tool: "cloudinary.trim", note: "look 27 · border trimmed", ms: 182 },
  { tool: "tesseract.read", note: "CELINE · LOOK 27 · AW26", ms: 941 },
  { tool: "parse.look", note: "brand CELINE · look 27 · AW26", ms: 3 },
  { tool: "agent.draft", note: "CELINE · look 27", ms: 1204 },
  { tool: "resend.send", note: "CELINE · pr@celine.demo", ms: 312 },
]

const FAQ = [
  {
    q: "Do my clients need an account?",
    a: "No. The link is the board — nothing to install, nothing to log in to. Showrooms work the same way: a link, not a login.",
  },
  {
    q: "What counts as a seat?",
    a: "A stylist who signs in. Clients and showrooms never take a seat, so a studio only pays for the people doing the work.",
  },
  {
    q: "Who sends the showroom emails?",
    a: "The agent drafts one per showroom from the approved looks. Nothing leaves the studio until you approve it, and every step it took stays on the record.",
  },
  {
    q: "What happens to the screenshots?",
    a: "They stay in your workspace with the looks they produced, filed by house and readable at any time. Delete a job and its images go with it.",
  },
]

const FOOTER_LINKS = [
  { label: "Board", href: "/board" },
  { label: "Client page", href: "/client" },
  { label: "Request emails", href: "/requests" },
  { label: "Agent trace", href: "/trace" },
]

/**
 * Landing — the product page.
 *
 * Visual direction: vende.framer.media for the type (a display scale that runs
 * past 120px, tight negative tracking, near-black on near-white, one accent) and
 * Dover Street Market for the density (full-bleed image band, hairline rules,
 * small labels doing the quiet work). The screens in `public/landing` are the
 * real ones, captured at 1440 — evidence, not illustration.
 *
 * Written for the productised app, not the hackathon demo: plans, seats, and the
 * client/showroom links as the story.
 */
export default function LandingPage() {
  const strip = stripImages()

  return (
    <main>
      <section className="mx-auto max-w-[1440px] px-6 pt-14 md:px-10 md:pt-20">
        <p className="text-[11px] tracking-[0.02em] text-muted-foreground">Sample trafficking</p>

        <h1 className="mt-8 text-[clamp(52px,8.6vw,128px)] font-bold leading-[0.88] tracking-[-0.06em] text-foreground">
          From screenshots to signed-off looks.
        </h1>

        {/* The action sits above the rule; the rule introduces the note. */}
        <div className="mt-10">
          <StartJobFlow kind="hero" />
        </div>

        <div className="mt-10 border-t border-border pt-6">
          <p className="max-w-[440px] text-[15px] leading-relaxed text-muted-foreground">
            Pull reads every look, builds the boards, and sends your client one link to approve — then
            turns those approvals into showroom requests and labels.
          </p>
        </div>
      </section>

      {/* Endless strip: the clothes are the argument, the chrome is hairline.
          Grab it and slide it; the side gutters are blur filters pinned over the
          band, not empty margins — a look leaves the frame out of focus. */}
      {strip.length ? (
        <LookMarquee srcs={strip} className="mt-16 border-t border-border md:mt-24" />
      ) : null}

      {/* How it works, with the screens moving. */}
      <section className="mx-auto max-w-[1440px] px-6 pt-20 md:px-10 md:pt-28">
        <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border pb-3">
          <p className="text-[11px] tracking-[0.02em] text-muted-foreground">How it works</p>
          <p className="text-[11px] tracking-[0.02em] text-muted-foreground">
            Three moves, one board
          </p>
        </div>

        <h2 className="mt-8 max-w-[16ch] text-[clamp(32px,4.6vw,64px)] font-semibold leading-[0.95] tracking-[-0.04em] text-foreground">
          Screenshots in. Requests out.
        </h2>

        <HowItWorks steps={STEPS} />
      </section>

      {/* The agent, on the record. */}
      <section className="mx-auto max-w-[1440px] px-6 pt-20 md:px-10 md:pt-28">
        <div className="grid gap-10 border-t border-border pt-8 md:grid-cols-2 md:gap-16">
          <div>
            <p className="text-[11px] tracking-[0.02em] text-muted-foreground">The agent</p>
            <h2 className="mt-5 max-w-[14ch] text-[clamp(28px,3.6vw,48px)] font-semibold leading-[1] tracking-[-0.035em] text-foreground">
              A pipeline, not a chat.
            </h2>
            <p className="mt-4 max-w-[44ch] text-[15px] leading-relaxed text-muted-foreground">
              Every step the agent takes is a named tool call with its arguments, its result and how
              long it took — visible while it runs, and kept afterwards. The agent drafts; you approve;
              then it sends.
            </p>
          </div>

          <div className="self-start">
            <AgentTraceReel rows={TRACE} />
          </div>
        </div>
      </section>

      {/* Plans. */}
      <section className="mx-auto max-w-[1440px] px-6 pt-20 md:px-10 md:pt-28">
        <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border pb-3">
          <p className="text-[11px] tracking-[0.02em] text-muted-foreground">Plans</p>
          <p className="text-[11px] tracking-[0.02em] text-muted-foreground">Cancel any time</p>
        </div>

        <h2 className="mt-8 max-w-[18ch] text-[clamp(32px,4.6vw,64px)] font-semibold leading-[0.95] tracking-[-0.04em] text-foreground">
          Priced per stylist.
        </h2>

        <Pricing />
      </section>

      {/* Questions. */}
      <section className="mx-auto max-w-[1440px] px-6 pt-20 md:px-10 md:pt-28">
        <div className="border-b border-border pb-3">
          <p className="text-[11px] tracking-[0.02em] text-muted-foreground">Questions</p>
        </div>

        <div className="mt-8 grid gap-x-16 gap-y-8 md:grid-cols-2">
          {FAQ.map((item) => (
            <div key={item.q} className="border-t border-border pt-4">
              <h3 className="text-[16px] font-medium leading-snug tracking-[-0.01em] text-foreground">
                {item.q}
              </h3>
              <p className="mt-2 max-w-[52ch] text-[14px] leading-relaxed text-muted-foreground">
                {item.a}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Close. */}
      <section className="mx-auto max-w-[1440px] px-6 pt-20 md:px-10 md:pt-28">
        <div className="flex flex-wrap items-end justify-between gap-8 border-t border-border pt-8">
          <h2 className="max-w-[16ch] text-[clamp(34px,5vw,72px)] font-semibold leading-[0.95] tracking-[-0.04em] text-foreground">
            Start with a folder of screenshots.
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <StartJobFlow kind="hero" />
            <Link href="/board" className="btn btn-ghost">
              See a board
            </Link>
          </div>
        </div>
      </section>

      <footer className="mx-auto mt-20 flex max-w-[1440px] flex-wrap items-end justify-between gap-6 border-t border-border px-6 py-10 md:px-10">
        <div className="flex flex-col gap-2">
          <p className="text-[11px] tracking-[0.02em] text-muted-foreground">
            Real labels · Real email · No client login
          </p>
          <nav aria-label="The product" className="flex flex-wrap gap-x-4 gap-y-1">
            {FOOTER_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-[11px] tracking-[0.02em] text-foreground hover:text-muted-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <p className="text-[11px] tracking-[0.02em] text-muted-foreground">New York</p>
      </footer>
    </main>
  )
}
