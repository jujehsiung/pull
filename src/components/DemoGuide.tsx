"use client"

/**
 * The demo guide — a wizard bar across the top of every demo surface.
 *
 * The hackathon demo is a script with three acts (DEMO.md), and the person on stage has
 * to hold two things at once: where the story is, and what to press next. This bar holds
 * both — the three acts as one track, the act currently on screen named with its
 * instruction, and a next press that moves to the following act's opening screen.
 *
 * It renders from the root layout and stays on every screen — the landing, the studio, the
 * dark client board, the intake form, the canvas, the dev surfaces. A guide that vanishes on
 * half the screens is a guide the presenter has to remember instead of read.
 *
 * It sits in the flow instead of sticky on purpose: the site header and the studio
 * header are both sticky at `top: 0`, and a third sticky layer would fight them.
 *
 * Dismissal collapses the bar to a single row rather than hiding it outright — a guide
 * you can lose with no way back is a trap, so the collapsed row says what it is and
 * takes one press to restore. The choice is remembered per browser.
 */
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"

type DemoAct = {
  /** The screen the act opens with. */
  href: string
  /** One word, sentence case — this is a label, not a title. */
  label: string
  /** What the act is, as the presenter would say it. */
  title: string
  /** The one instruction that matters on that screen. */
  hint: string
}

const ACTS: DemoAct[] = [
  {
    // `/board` (the public board surface), not `/studio`: the studio is behind
    // requireStylist, so a logged-out visitor — a judge, a phone, a fresh browser —
    // would bounce to /login and the guide would dead-end on its first press.
    href: "/board",
    label: "board",
    title: "Act 1 · the board",
    hint: "The board a client opens from one link — imported and published in the studio.",
  },
  {
    href: "/client",
    label: "approval",
    title: "Act 2 · the approval",
    hint: "The client approves, stars and submits — one link, no login.",
  },
  {
    href: "/requests",
    label: "intake",
    title: "Act 3 · intake and labels",
    hint: "Shippo rates, the gated buy, then the label reply.",
  },
]

const STORAGE_KEY = "pull:demo-guide"

/** Which act the current route belongs to. Ordered most specific first. */
function actFor(pathname: string): number {
  if (pathname.startsWith("/b/") || pathname.startsWith("/client") || pathname.startsWith("/approved")) return 1
  if (pathname === "/requests" || pathname.startsWith("/requests/")) return 2
  if (pathname.startsWith("/i/")) return 2
  // The requests page lives under the job it belongs to — this is where Act 3 starts.
  if (/^\/studio\/jobs\/[^/]+\/requests/.test(pathname)) return 2
  return 0
}

export function DemoGuide() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(STORAGE_KEY) === "collapsed")
    } catch {
      // Storage blocked (private mode, strict settings): the guide stays open.
    }
  }, [])

  function persistCollapsed(next: boolean) {
    setCollapsed(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "collapsed" : "open")
    } catch {
      // Same trade: a preference that cannot be saved is not worth an error.
    }
  }

  if (collapsed) {
    return (
      <div className="demo-guide demo-guide-collapsed">
        <button
          type="button"
          className="demo-guide-reveal"
          onClick={() => persistCollapsed(false)}
          aria-expanded={false}
        >
          <span className="demo-guide-mark mono">demo guide</span>
          <span>show the three acts</span>
        </button>
      </div>
    )
  }

  const current = actFor(pathname)
  const next = (current + 1) % ACTS.length
  const act = ACTS[current]

  return (
    <nav className="demo-guide" aria-label="Demo guide">
      <span className="demo-guide-mark mono" aria-hidden>
        demo
      </span>

      <ol className="demo-guide-steps">
        {ACTS.map((item, index) => (
          <li key={item.label}>
            <Link
              href={item.href}
              className="demo-guide-step"
              aria-current={index === current ? "step" : undefined}
            >
              <span className="demo-guide-n" aria-hidden>
                {String(index + 1).padStart(2, "0")}
              </span>
              <span>{item.label}</span>
            </Link>
          </li>
        ))}
      </ol>

      <span className="demo-guide-now">
        <span className="demo-guide-title">{act.title}</span>
        <span className="demo-guide-hint">{act.hint}</span>
      </span>

      <span className="demo-guide-actions">
        <Link
          href={ACTS[next].href}
          className="demo-guide-next"
          aria-label={
            current === ACTS.length - 1 ? "Start the demo again" : `Next act: ${ACTS[next].label}`
          }
        >
          {/* The words are dropped on a phone; the arrow keeps the control one row. */}
          <span className="demo-guide-next-label">
            {current === ACTS.length - 1 ? "start over" : `next: ${ACTS[next].label}`}
          </span>
          <span aria-hidden>→</span>
        </Link>
        <button
          type="button"
          className="demo-guide-hide"
          onClick={() => persistCollapsed(true)}
          aria-expanded
        >
          hide
        </button>
      </span>
    </nav>
  )
}
