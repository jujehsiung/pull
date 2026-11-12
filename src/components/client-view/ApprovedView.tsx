"use client"

/**
 * /approved — the stylist's view of what the client sent back.
 *
 * The same board the client saw, in the same order, with the same markups: the point is that
 * neither side has to describe what happened. It reads the approval record the client board
 * wrote, so a stylist opening it from the bell sees exactly the state the client left.
 */
import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Brush, Check } from "lucide-react"

import {
  markApprovalSeen,
  readApproval,
  subscribeApproval,
  type ApprovalRecord,
} from "@/lib/approved-store"

function formatWhen(stamp: number): string {
  return new Date(stamp).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export function ApprovedView() {
  const [record, setRecord] = useState<ApprovalRecord | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const sync = () => setRecord(readApproval())
    sync()
    setReady(true)
    markApprovalSeen()
    return subscribeApproval(sync)
  }, [])

  const grouped = useMemo(() => {
    const map = new Map<string, NonNullable<ApprovalRecord>["looks"]>()
    for (const look of record?.looks ?? []) {
      const list = map.get(look.brand) ?? []
      list.push(look)
      map.set(look.brand, list)
    }
    return [...map.entries()]
  }, [record])

  if (!ready) return null

  if (!record || record.looks.length === 0) {
    return (
      <main className="mx-auto max-w-[1440px] px-6 py-16 md:px-10">
        <p className="text-[10px] tracking-[0.02em] text-muted-foreground">Client approval</p>
        <h1 className="mt-2 text-[clamp(28px,3.4vw,44px)] font-semibold leading-[1.02] tracking-[-0.03em]">
          Nothing approved yet.
        </h1>
        <p className="mt-3 max-w-[520px] text-[13px] leading-relaxed text-muted-foreground">
          Send a board to the client first. When they approve selects and draw their markups, the
          decision lands here and in the bell.
        </p>
        <Link href="/client" className="mt-6 inline-block text-[12px] text-foreground underline">
          Open the client board
        </Link>
      </main>
    )
  }

  const markups = record.looks.filter((look) => look.markup).length

  return (
    <main className="mx-auto max-w-[1440px] px-6 pb-24 pt-10 md:px-10">
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-border pb-6">
        <div>
          <p className="text-[10px] tracking-[0.02em] text-muted-foreground">Client approval</p>
          <h1 className="mt-1.5 text-[clamp(28px,3.4vw,44px)] font-semibold leading-[1.02] tracking-[-0.03em]">
            {record.client} approved {record.looks.length} {record.looks.length === 1 ? "look" : "looks"}
          </h1>
          <p className="mt-2 text-[12px] text-muted-foreground">
            {record.job} · {formatWhen(record.submittedAt)} · {markups} with markup ·{" "}
            {record.passed.length} passed
          </p>
        </div>
        <Link
          href="/canvas?tab=approved"
          className="text-[12px] text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
        >
          Take them into the studio →
        </Link>
      </header>

      <div className="mt-10 flex flex-col gap-16">
        {grouped.map(([brand, looks]) => (
          <section key={brand} aria-label={brand}>
            <div className="flex items-baseline justify-between border-b border-border pb-2">
              <h2 className="text-[16px] font-medium tracking-[-0.01em]">{brand}</h2>
              <span className="font-mono text-[10px] text-muted-foreground-soft">
                {looks.length} approved
              </span>
            </div>
            <ul className="mt-px grid grid-cols-2 border-l border-t border-border sm:grid-cols-3 lg:grid-cols-5">
              {looks.map((look) => (
                <li key={look.id} className="border-b border-r border-border bg-background">
                  <div className="relative aspect-[3/4] overflow-hidden bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={look.image} alt="" className="size-full object-cover" />
                    {look.markup ? (
                      // The client's pen, exactly as they drew it, over the same photograph.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={look.markup}
                        alt=""
                        aria-hidden
                        className="pointer-events-none absolute inset-0 size-full object-cover"
                      />
                    ) : null}
                    <span className="absolute left-1.5 top-1.5 flex items-center gap-1 bg-success px-1.5 py-0.5 font-mono text-[9px] text-background">
                      <Check className="size-2.5" aria-hidden />
                      approved
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between px-1.5 py-1 font-mono text-[10px] text-muted-foreground-soft">
                    <span>
                      Look {look.lookNo}
                      {look.season ? ` · ${look.season}` : ""}
                    </span>
                    {look.markup ? (
                      <span className="flex items-center gap-1 text-foreground">
                        <Brush className="size-2.5" aria-hidden />
                        markup
                      </span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <p className="mt-14 text-[11px] leading-relaxed text-muted-foreground-soft">
        The client sees this same board — same order, same markups. In the studio, these looks sit
        under <span className="text-foreground">Approved</span> in the assets panel: drag one onto the
        canvas to build a look from it.
      </p>
    </main>
  )
}
