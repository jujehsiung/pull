import Link from "next/link"
import { AgentTrace } from "@/components/AgentTrace"
import { AgentProviderBadge } from "@/components/AgentProviderBadge"
import type { AgentStep } from "@/lib/agent/trace"

export const metadata = { title: "PULL — sample trace" }

const now = Date.now()
const at = (offsetMs: number) => new Date(now - 9000 + offsetMs).toISOString()

/** A real trace shape, taken from the pipeline in PRD §7. */
const IMPORT_TRACE: AgentStep[] = [
  {
    id: "1",
    tool: "cloudinary.upload",
    status: "ok",
    durationMs: 812,
    at: at(0),
    args: { file: "celine_look_27_aw26.png", folder: "pull/jobs/oscar-campaign" },
    result: { public_id: "pull/jobs/oscar-campaign/celine_look_27", bytes: 184320 },
  },
  {
    id: "2",
    tool: "cloudinary.trim",
    status: "ok",
    durationMs: 306,
    at: at(820),
    args: { public_id: "pull/jobs/oscar-campaign/celine_look_27", effect: "trim:20", target: "3:4" },
    result: { removed_pct: 62, width: 1200, height: 1600, url: "res.cloudinary.com/…/c_fill,w_1200,h_1600" },
  },
  {
    id: "3",
    tool: "tesseract.read",
    status: "ok",
    durationMs: 1604,
    at: at(1130),
    args: { public_id: "pull/jobs/oscar-campaign/celine_look_27", psm: 6 },
    result: { text: "vogue.com/runway/celine\nLook 27 — AW26\nCELINE - runway", confidence: 92 },
  },
  {
    id: "4",
    tool: "parse.look",
    status: "ok",
    durationMs: 3,
    at: at(2740),
    args: { text: "vogue.com/runway/celine\nLook 27 — AW26\nCELINE - runway", filename: "celine_look_27_aw26.png" },
    result: { lookNo: 27, season: "AW26", brand: "CELINE", readSource: "image", confidence: 0.92 },
  },
  {
    id: "5",
    tool: "db.group_boards",
    status: "ok",
    durationMs: 41,
    at: at(2750),
    args: { jobId: "job_oscar", looks: 10 },
    result: { boards: 5, brands: ["CELINE", "BOTTEGA VENETA", "JIL SANDER", "LEMAIRE", "PRADA"] },
  },
  {
    id: "6",
    tool: "shippo.rates",
    status: "error",
    durationMs: 243,
    at: at(2800),
    args: { from: "12 Rue de la Paix, Paris", to: "Juje Studio, New York", parcel: { l: 40, w: 30, h: 12, kg: 2.4 } },
    error: "Shippo 401: Invalid token — add SHIPPO_API_KEY (test) in .env.local",
  },
  {
    id: "7",
    tool: "shippo.rates",
    status: "ok",
    durationMs: 486,
    at: at(3160),
    args: { from: "12 Rue de la Paix, Paris", to: "Juje Studio, New York", parcel: { l: 40, w: 30, h: 12, kg: 2.4 } },
    result: { shipment: "shp_9f21", rates: 3, cheapest: "UPS Ground $62.40 / 4 days" },
  },
  {
    id: "8",
    tool: "resend.send",
    status: "ok",
    durationMs: 391,
    at: at(3700),
    args: { to: "press@celine.com", template: "request", looks: [27, 31], callIn: "2026-11-14", return: "2026-11-18" },
    result: { id: "re_4c8a…", status: "sent" },
  },
]

export default function TracePage() {
  return (
    <main className="mx-auto max-w-[1440px] px-6 pb-20 md:px-10">
      <section className="border-b border-border py-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-6">
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-[10px] tracking-[0.02em] text-muted-foreground">Sample trace</p>
            <h1 className="text-[clamp(30px,3.4vw,46px)] font-semibold leading-[0.95] tracking-[-0.035em] text-foreground">
              Every tool call, in the open.
            </h1>
            <p className="mt-2 max-w-[560px] text-[13px] leading-relaxed text-muted-foreground">
              The agent is a pipeline, not a chatbot. Each step is a named tool with its input, its
              output, how long it took and whether it failed — shown while it runs, and kept afterwards.
              Nothing hides behind a spinner.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 md:ml-auto">
            <AgentProviderBadge hint="The backend that produced these steps. server-side only." />
            <Link href="/setup" className="btn btn-ghost btn-sm">
              Stack setup
            </Link>
          </div>
        </div>
      </section>

      <div className="mt-10 grid gap-10 md:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] md:gap-14">
        <AgentTrace steps={IMPORT_TRACE} title="Import · 10 screenshots — a sample run" />

        <div className="flex max-w-[460px] flex-col gap-8">
          <div className="border-t border-border pt-4">
            <p className="text-[11px] tracking-[0.02em] text-muted-foreground">
              Why this is a requirement
            </p>
            <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
              A stylist is accountable for what leaves her studio. If the agent crops the wrong thing or
              reads “Look 27” when it is “Look 21”, she has to see that before the board goes to the
              client. The trace is the difference between an assistant and a black box.
            </p>
          </div>

          <div className="border-t border-border pt-4">
            <p className="text-[11px] tracking-[0.02em] text-muted-foreground">What each step carries</p>
            <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-4 text-[13px] leading-relaxed text-muted-foreground">
              <li>
                tool name — <span className="font-mono text-[12px] text-foreground">cloudinary.trim</span>,{" "}
                <span className="font-mono text-[12px] text-foreground">tesseract.read</span>,{" "}
                <span className="font-mono text-[12px] text-foreground">shippo.rates</span>
              </li>
              <li>input — the exact arguments passed</li>
              <li>output — the structured result the next step uses</li>
              <li>duration — so a slow step is visible, not felt</li>
              <li>status — ok or error, with the provider&apos;s message kept verbatim</li>
            </ul>
          </div>

          <div className="border-t border-border pt-4">
            <p className="text-[11px] tracking-[0.02em] text-muted-foreground">Where it shows up</p>
            <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
              Live while importing (streamed), on the job page as the activity trail, and next to each
              request when a label or email fails. Failed steps are retryable from the trace.
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}
