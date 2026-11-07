import Link from "next/link"
import { SiteMenu } from "./SiteMenu"

/**
 * The site header: the wordmark, a hairline, and the one control that opens
 * navigation. Nothing else lives in it, which is what lets it be this empty.
 *
 * It was born on the landing page; it now renders from `app/(site)/layout.tsx`
 * so every page in that group shares one instance — navigating between the
 * landing and the board moves the page, never the header.
 */
export function SiteHeader() {
  return (
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
  )
}
