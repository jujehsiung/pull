"use client"

/**
 * The agent builds the emails — one per brand, from the looks the client approved.
 *
 * This is the screen the bell lands on: the client's decisions are already in,
 * and the only work left is turning them into requests. The agent drafts; the
 * stylist edits, approves and sends. Nothing leaves the studio until both have
 * happened, which is why there are two gates (Approve, then Send) rather than
 * one.
 *
 * Design surface: drafts are local, "Polish" is a stand-in for the agent call,
 * and no mail is sent.
 */
import { useMemo, useState } from "react"
import { Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"

import { AgentRun, type AgentStep } from "./AgentRun"

export interface RequestLook {
  id: string
  lookNo: number
  season: string | null
  src: string
}

export interface RequestBrand {
  brand: string
  contactEmail: string
  looks: RequestLook[]
}

export interface RequestJob {
  client: string
  title: string
  shootDate: string
  callInDate: string
  returnDate: string
  shipTo: string
}

type Status = "draft" | "queued" | "sent"

interface Draft {
  /** Where it goes — the showroom's PR address, editable until sent. */
  to: string
  subject: string
  body: string
  status: Status
  polished: boolean
  savedAt?: number
}

function formatDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

/** Good enough to know a human typed an address; the send action re-checks. */
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

function draftFor(
  brand: RequestBrand,
  job: RequestJob,
): { to: string; subject: string; body: string } {
  const list = brand.looks
    .slice()
    .sort((a, b) => a.lookNo - b.lookNo)
    .map((look) => `• Look ${look.lookNo}${look.season ? ` (${look.season})` : ""}`)
    .join("\n")

  return {
    to: brand.contactEmail,
    subject: `PULL request — ${brand.brand} · ${job.client} · ${brand.looks.length} look${
      brand.looks.length === 1 ? "" : "s"
    }`,
    body: `Hi ${brand.brand} PR team,

I am pulling for ${job.client} on ${job.title}. Requesting:

${list}

Shoot details
  Shoot date:    ${formatDate(job.shootDate)}
  Call-in date:  ${formatDate(job.callInDate)}
  Return date:   ${formatDate(job.returnDate)}
  Ship to:       ${job.shipTo}

Please ship on your own account — we do not need a label.

Thank you,
Juje`,
  }
}

/** What the agent's polish pass does to a draft: tighter greeting and sign-off. */
function polished(body: string): string {
  return body
    .replace(/^Hi (.+) PR team,/m, "Hi $1 team,")
    .replace(/\n\nThank you,\nJuje$/, "\n\nThank you for the help — Juje")
}

const STATUS_LABEL: Record<Status, string> = { draft: "Draft", queued: "Approved", sent: "Sent" }

export function RequestEmails({ job, brands }: { job: RequestJob; brands: RequestBrand[] }) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [run, setRun] = useState<{ steps: AgentStep[]; brands: (string | null)[] } | null>(null)
  const [running, setRunning] = useState(false)
  const [polishing, setPolishing] = useState<string | null>(null)
  const [sending, setSending] = useState<string | null>(null)

  const counts = useMemo(() => {
    const all = Object.values(drafts)
    return {
      drafted: all.length,
      queued: all.filter((draft) => draft.status === "queued").length,
      sent: all.filter((draft) => draft.status === "sent").length,
    }
  }, [drafts])

  const approvedLooks = brands.reduce((total, brand) => total + brand.looks.length, 0)

  const draftAll = () => {
    if (running) return

    // A sent email is never rewritten; everything else is drafted again, one
    // card per step, so the screen fills as the agent works.
    setDrafts((current) =>
      Object.fromEntries(Object.entries(current).filter(([, draft]) => draft.status === "sent")),
    )

    // What the tracer really writes for this step: one agent.draft per brand,
    // with the brand and the look numbers it requested.
    const steps: AgentStep[] = brands.map((brand) => ({
      tool: "agent.draft",
      note: `${brand.brand} · look ${brand.looks
        .map((look) => look.lookNo)
        .sort((a, b) => a - b)
        .join(", ")}`,
      ms: 700,
    }))

    setRun({ steps, brands: brands.map((brand) => brand.brand) })
    setRunning(true)
  }

  const stepLanded = (step: AgentStep, index: number) => {
    const brandName = run?.brands[index]
    if (!brandName) return
    const brand = brands.find((candidate) => candidate.brand === brandName)
    if (!brand) return
    if (step.tool === "resend.send") {
      setDrafts((current) =>
        current[brandName] && current[brandName].status === "queued"
          ? { ...current, [brandName]: { ...current[brandName], status: "sent", savedAt: undefined } }
          : current,
      )
      setSending(null)
      return
    }

    setDrafts((current) =>
      current[brandName] && current[brandName].status === "sent"
        ? current
        : { ...current, [brandName]: { ...draftFor(brand, job), status: "draft", polished: false } },
    )
  }

  /** Sending is a traced action too: `resend.send`, one per email. */
  const sendEmail = (brand: RequestBrand) => {
    if (sending) return
    setSending(brand.brand)
    const step: AgentStep = {
      tool: "resend.send",
      note: `${brand.brand} · ${drafts[brand.brand]?.to ?? brand.contactEmail}`,
      ms: 900,
    }
    setRun((current) =>
      current
        ? { steps: [...current.steps, step], brands: [...current.brands, brand.brand] }
        : { steps: [step], brands: [brand.brand] },
    )
  }

  const polish = (brandName: string) => {
    setPolishing(brandName)
    setTimeout(() => {
      setDrafts((current) => {
        const draft = current[brandName]
        if (!draft || draft.status === "sent") return current
        return {
          ...current,
          [brandName]: { ...draft, body: polished(draft.body), polished: true },
        }
      })
      setPolishing(null)
    }, 700)
  }

  const patch = (brand: string, change: Partial<Draft>) =>
    setDrafts((current) =>
      current[brand] ? { ...current, [brand]: { ...current[brand], ...change } } : current,
    )

  return (
    <main className="mx-auto max-w-[1440px] px-6 pb-16 md:px-10">
      <header className="border-b border-border py-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-6">
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-[10px] tracking-[0.02em] text-muted-foreground">Request emails</p>
            <h1 className="text-[clamp(30px,3.4vw,46px)] font-semibold leading-[0.95] tracking-[-0.035em] text-foreground">
              {job.client}
            </h1>
            <p className="text-[12px] tracking-[0.02em] text-muted-foreground">{job.title}</p>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-3 md:ml-auto md:flex-col md:items-end md:gap-2">
            <span className="text-[11px] tracking-[0.02em] text-muted-foreground">
              <b className="font-medium text-foreground">{brands.length}</b> brands ·{" "}
              <b className="font-medium text-foreground">{counts.queued}</b> approved ·{" "}
              <b className="font-medium text-foreground">{counts.sent}</b> sent
            </span>
            <Button
              variant="outline"
              size="sm"
              className="agent-action"
              onClick={draftAll}
              disabled={running}
            >
              <Sparkles className="size-3.5" aria-hidden />
              {running ? "Drafting…" : counts.drafted ? "Redraft requests" : "Draft requests"}
            </Button>
          </div>
        </div>
      </header>

      <p className="mt-6 max-w-[620px] text-[13px] leading-relaxed text-muted-foreground">
        Draft one email per brand from the client&apos;s approved looks. Nothing is sent until you
        approve it.
      </p>

      {run ? (
        <AgentRun
          steps={run.steps}
          onStep={stepLanded}
          onDone={() => setRunning(false)}
        />
      ) : null}

      {counts.drafted === 0 && !run ? (
        <div className="mt-10 flex max-w-[760px] flex-col items-start gap-2 border-t border-border pt-6">
          <p className="text-[13px] text-foreground">No drafts yet.</p>
          <p className="text-[13px] text-muted-foreground">
            The agent writes one email per brand that has approved looks.
          </p>
        </div>
      ) : (
        <div className="mt-10 flex max-w-[760px] flex-col gap-12">
          {brands.map((brand) => {
            const draft = drafts[brand.brand]
            if (!draft) return null
            const locked = draft.status === "sent"
            return (
              <article key={brand.brand} className="border-t border-border pt-6">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                  <div className="flex items-center gap-3">
                    <h2 className="text-[20px] font-medium leading-none tracking-[0.02em] text-foreground">
                      {brand.brand}
                    </h2>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] tracking-[0.02em] ${
                        draft.status === "sent"
                          ? "border-foreground text-foreground"
                          : draft.status === "queued"
                            ? "border-success text-success"
                            : "border-border text-muted-foreground"
                      }`}
                    >
                      {STATUS_LABEL[draft.status]}
                    </span>
                  </div>
                  <span className="text-[11px] tracking-[0.02em] text-muted-foreground">
                    {brand.looks.length} look{brand.looks.length === 1 ? "" : "s"}
                  </span>
                </div>

                {/* The looks being requested, as the client approved them. */}
                <div className="mt-4 flex w-fit gap-px bg-border">
                  {brand.looks.map((look) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={look.id}
                      src={look.src}
                      alt={`${brand.brand} look ${look.lookNo}`}
                      className="size-12 object-cover"
                    />
                  ))}
                </div>

                <div className="mt-5 flex flex-col gap-3">
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor={`to-${brand.brand}`}
                      className="text-[11px] tracking-[0.02em] text-muted-foreground"
                    >
                      To
                    </label>
                    <input
                      id={`to-${brand.brand}`}
                      type="email"
                      value={draft.to}
                      onChange={(event) => patch(brand.brand, { to: event.target.value })}
                      disabled={locked}
                      placeholder="showroom@brand.com"
                      className="h-9 w-full border border-border bg-background px-3 text-[13px] text-foreground outline-none focus-visible:border-ring disabled:opacity-60"
                    />
                    {!looksLikeEmail(draft.to) ? (
                      <span role="status" className="text-[11px] tracking-[0.02em] text-tertiary">
                        No showroom address — the request cannot be sent until this is filled.
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor={`subject-${brand.brand}`}
                      className="text-[11px] tracking-[0.02em] text-muted-foreground"
                    >
                      Subject
                    </label>
                    <input
                      id={`subject-${brand.brand}`}
                      value={draft.subject}
                      onChange={(event) => patch(brand.brand, { subject: event.target.value })}
                      disabled={locked}
                      className="h-9 w-full border border-border bg-background px-3 text-[13px] text-foreground outline-none focus-visible:border-ring disabled:opacity-60"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor={`body-${brand.brand}`}
                      className="text-[11px] tracking-[0.02em] text-muted-foreground"
                    >
                      Body
                    </label>
                    <textarea
                      id={`body-${brand.brand}`}
                      value={draft.body}
                      onChange={(event) => patch(brand.brand, { body: event.target.value })}
                      disabled={locked}
                      rows={12}
                      className="w-full resize-y border border-border bg-background p-3 text-[13px] leading-relaxed text-foreground outline-none focus-visible:border-ring disabled:opacity-60"
                    />
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="agent-action"
                      disabled={locked || polishing === brand.brand}
                      onClick={() => polish(brand.brand)}
                    >
                      <Sparkles className="size-3.5" aria-hidden />
                      {polishing === brand.brand ? "Polishing…" : "Polish"}
                    </Button>
                    {draft.polished ? (
                      <span className="text-[11px] tracking-[0.02em] text-muted-foreground">
                        Agent rewrote this draft
                      </span>
                    ) : null}
                    {draft.savedAt ? (
                      <span className="text-[11px] tracking-[0.02em] text-muted-foreground">
                        Saved
                      </span>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={locked}
                      onClick={() => patch(brand.brand, { savedAt: Date.now() })}
                    >
                      Save draft
                    </Button>
                    <Button
                      size="sm"
                      disabled={locked || draft.status === "queued" || !looksLikeEmail(draft.to)}
                      aria-pressed={draft.status === "queued"}
                      onClick={() => patch(brand.brand, { status: "queued", savedAt: undefined })}
                    >
                      {draft.status === "queued" ? "Approved" : "Approve"}
                    </Button>
                    <Button
                      size="sm"
                      disabled={draft.status !== "queued" || !looksLikeEmail(draft.to) || sending !== null}
                      onClick={() => sendEmail(brand)}
                    >
                      {locked ? "Sent" : sending === brand.brand ? "Sending…" : "Send"}
                    </Button>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </main>
  )
}
