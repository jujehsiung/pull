"use client"

/**
 * The bell — what happened while the stylist was away.
 *
 * The notices are derived, not stored: a reviewed board the stylist has not
 * acknowledged yet. Opening one stamps it seen and lands on the requests page,
 * where the agent drafts the showroom emails; the badge clears because the row
 * it was counting no longer matches the unread rule.
 */
import { useEffect, useState } from "react"
import Link from "next/link"
import { Bell, Brush, Check } from "lucide-react"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  isApprovalUnread,
  markApprovalSeen,
  readApproval,
  subscribeApproval,
  type ApprovalRecord,
} from "@/lib/approved-store"
import { markAllReviewsSeenForm, markReviewSeenForm } from "@/server/actions/notifications"
import type { ReviewNotice } from "@/server/queries/notifications"

export function NotificationsBell({ notices }: { notices: ReviewNotice[] }) {
  // The client's approval arrives through the same store the board and the studio read,
  // so the bell, /approved and the studio's Approved tab can never disagree.
  const [approval, setApproval] = useState<ApprovalRecord | null>(null)
  const [approvalUnread, setApprovalUnread] = useState(false)

  useEffect(() => {
    const sync = () => {
      setApproval(readApproval())
      setApprovalUnread(isApprovalUnread())
    }
    sync()
    return subscribeApproval(sync)
  }, [])

  const unread = notices.length
  const clientUnread = approvalUnread ? 1 : 0

  const openClientApproval = () => {
    markApprovalSeen()
    setApprovalUnread(false)
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={
            unread + clientUnread > 0 ? `Notifications, ${unread + clientUnread} unread` : "Notifications"
          }
          className="relative flex size-11 items-center justify-center text-foreground"
        >
          <Bell className="size-[22px]" aria-hidden />
          {unread + clientUnread > 0 ? (
            <span
              aria-hidden
              className="absolute right-2.5 top-2.5 size-1.5 rounded-full bg-foreground"
            />
          ) : null}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={6} className="w-[360px] p-0">
        <div className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-3">
          <p className="text-[13px] font-medium text-foreground">Notifications</p>
          {unread ? (
            <form action={markAllReviewsSeenForm}>
              <button
                type="submit"
                className="text-[11px] tracking-[0.02em] text-muted-foreground hover:text-foreground"
              >
                Mark all read
              </button>
            </form>
          ) : null}
        </div>

        {clientUnread && approval ? (
          <Link
            href="/approved"
            onClick={openClientApproval}
            className="flex w-full items-start gap-2.5 border-b border-border px-4 py-3 text-left hover:bg-muted"
          >
            <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-foreground" />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[13px] leading-snug text-foreground">
                <span className="font-medium">{approval.client}</span> approved{" "}
                <span className="font-medium">
                  {approval.looks.length} {approval.looks.length === 1 ? "look" : "looks"}
                </span>{" "}
                for {approval.job}
              </span>
              <span className="flex items-center gap-1.5 text-[11px] tracking-[0.02em] text-muted-foreground">
                {approval.looks.filter((look) => look.markup).length} with markup · new
              </span>
              <span className="flex items-center gap-1 text-[11px] tracking-[0.02em] text-foreground">
                <Brush className="size-3" aria-hidden />
                See the approved looks and markups →
              </span>
            </span>
          </Link>
        ) : null}

        {unread ? (
          <ul>
            {notices.map((notice) => (
              <li key={notice.jobId} className="border-b border-border last:border-b-0">
                <form action={markReviewSeenForm}>
                  <input type="hidden" name="jobId" value={notice.jobId} />
                  <button
                    type="submit"
                    className="flex w-full items-start gap-2.5 px-4 py-3 text-left hover:bg-muted"
                  >
                    <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-foreground" />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-[13px] leading-snug text-foreground">
                        <span className="font-medium">{notice.clientName}</span> sent approvals for{" "}
                        <span className="font-medium">{notice.title}</span>
                      </span>
                      <span className="text-[11px] tracking-[0.02em] text-muted-foreground">
                        {notice.approved} approved · {notice.passed} passed · {notice.submittedAt}
                      </span>
                      <span className="text-[11px] tracking-[0.02em] text-foreground">
                        Draft the showroom emails →
                      </span>
                    </span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : clientUnread ? null : (
          <p className="flex items-center gap-2 px-4 py-6 text-[13px] text-muted-foreground">
            <Check className="size-3.5" aria-hidden />
            Nothing waiting on you.
          </p>
        )}

        <div className="border-t border-border px-4 py-2.5">
          <span className="flex items-center gap-3">
            <Link
              href="/studio"
              className="text-[11px] tracking-[0.02em] text-muted-foreground hover:text-foreground"
            >
              Open the studio
            </Link>
            <Link
              href="/approved"
              onClick={openClientApproval}
              className="text-[11px] tracking-[0.02em] text-muted-foreground hover:text-foreground"
            >
              Client approvals
            </Link>
          </span>
        </div>
      </PopoverContent>
    </Popover>
  )
}
