"use client"

/**
 * The header menu: two hairlines that cross into an X, over a full-bleed menu.
 *
 * The header holds nothing else — the wordmark and this button — so navigation
 * has to live behind it. Lines are done in CSS transforms rather than swapping
 * an icon so the two states animate as one object.
 */
import { useEffect, useState } from "react"
import Link from "next/link"

const LINKS = [
  { label: "Board", href: "/board" },
  { label: "Client page", href: "/client" },
  { label: "Request emails", href: "/requests" },
  { label: "Client view", href: "/preview/client.html" },
  { label: "Agent trace", href: "/trace" },
]

export function SiteMenu() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : ""
    return () => {
      document.body.style.overflow = ""
    }
  }, [open])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="site-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        className="relative z-[60] flex size-11 flex-col items-center justify-center"
      >
        <span
          className="block h-px w-7 bg-foreground transition-transform duration-300 ease-out"
          style={open ? { transform: "translateY(3.5px) rotate(45deg)" } : undefined}
        />
        <span
          className="mt-[7px] block h-px w-7 bg-foreground transition-transform duration-300 ease-out"
          style={open ? { transform: "translateY(-3.5px) rotate(-45deg)" } : undefined}
        />
      </button>

      <div
        id="site-menu"
        hidden={!open}
        className="fixed inset-0 z-50 bg-background"
        style={{ display: open ? undefined : "none" }}
      >
        <nav className="mx-auto flex h-full max-w-[1440px] flex-col justify-center px-6 md:px-10">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="border-b border-border py-5 text-[clamp(34px,6vw,72px)] font-bold leading-[0.95] tracking-[-0.04em] text-foreground first:border-t hover:text-muted-foreground"
            >
              {link.label}
            </Link>
          ))}
          <p className="mt-10 text-[11px] tracking-[0.02em] text-muted-foreground">
            Sample trafficking · New York
          </p>
        </nav>
      </div>
    </>
  )
}
