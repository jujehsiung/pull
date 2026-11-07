import Link from "next/link"

import { getStylist } from "@/lib/auth"
import { unreadReviews, type ReviewNotice } from "@/server/queries/notifications"
import { NotificationsBell } from "./NotificationsBell"
import { SiteMenu } from "./SiteMenu"

/**
 * A reviewed board the stylist has not acknowledged yet.
 *
 * Tolerated failure on purpose: this header is also the public one, and on a
 * machine with no `DATABASE_URL` the site must still render — an empty bell is
 * better than a dead page.
 */
async function noticesForHeader(): Promise<ReviewNotice[]> {
  try {
    const stylist = await getStylist()
    if (!stylist) return []
    return await unreadReviews(stylist.id)
  } catch {
    return []
  }
}

/**
 * The site header: the wordmark, a hairline, and the one control that opens
 * navigation. Nothing else lives in it, which is what lets it be this empty.
 *
 * It was born on the landing page; it now renders from `app/(site)/layout.tsx`
 * so every page in that group shares one instance — navigating between the
 * landing and the board moves the page, never the header.
 */
export async function SiteHeader() {
  const notices = await noticesForHeader()

  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between px-6 py-3 md:px-10">
        <Link
          href="/"
          className="text-[19px] font-extrabold tracking-[0.01em] text-foreground"
        >
          PULL.
        </Link>
        <div className="flex items-center gap-1">
          <NotificationsBell notices={notices} />
          <SiteMenu />
        </div>
      </div>
    </header>
  )
}
