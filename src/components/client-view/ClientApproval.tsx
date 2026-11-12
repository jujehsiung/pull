"use client"

/**
 * Act 2 of the landing demo: the client's page, filled from the shortlist the board just sent.
 *
 * With no shortlist in this tab it falls back to the seeded design surface, with a strip saying so,
 * so the act is still reviewable on a cold load. Once the board sends a selection, this page is the
 * client link: their job, their looks, no login.
 */
import Link from "next/link"
import { useEffect, useState } from "react"

import type { Look } from "@/components/start-job/ReviewBoard"
import { readDemoBoard, type DemoLook } from "@/lib/demo-session"

import { ClientBoard, type ClientBoardJob } from "./ClientBoard"

function asLook(look: DemoLook): Look {
  return {
    id: look.id,
    fileName: `${look.brand}-look-${look.lookNo}.jpg`,
    brand: look.brand,
    lookNo: look.lookNo,
    season: look.season,
    suggested: true,
    source: look.src,
    status: "ready",
    src: look.src,
  }
}

interface ClientView {
  job: ClientBoardJob
  looks: Look[]
  demo: boolean
}

export function ClientApproval({
  fallbackJob,
  fallbackLooks,
}: {
  fallbackJob: ClientBoardJob
  fallbackLooks: Look[]
}) {
  const [view, setView] = useState<ClientView | null>(null)

  useEffect(() => {
    const board = readDemoBoard()
    if (board) {
      setView({
        job: { title: board.job.title, client: board.job.client, dueDate: board.job.dueDate },
        looks: board.looks.map(asLook),
        demo: true,
      })
      return
    }
    setView({ job: fallbackJob, looks: fallbackLooks, demo: false })
    // The fallbacks are server-rendered once for this page; read the session once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!view) {
    return (
      <main className="mx-auto max-w-[1440px] px-6 py-16 md:px-10">
        <p className="text-[13px] text-muted-foreground">Opening your link…</p>
      </main>
    )
  }

  return (
    <>
      {view.demo ? null : (
        <div className="border-b border-border bg-muted">
          <p className="mx-auto max-w-[1440px] px-6 py-2 text-[11px] tracking-[0.02em] text-muted-foreground md:px-10">
            Design preview — no client selection has been sent yet. Shortlist looks on the{" "}
            <Link href="/board" className="underline underline-offset-2">
              board
            </Link>{" "}
            and press Send to client to fill this page.
          </p>
        </div>
      )}
      <ClientBoard job={view.job} looks={view.looks} />
    </>
  )
}
