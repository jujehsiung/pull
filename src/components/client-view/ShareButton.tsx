"use client"

/**
 * Sharing the client's link onward.
 *
 * The link often reaches an agent rather than the person it is about, so the
 * page has to be forwardable: the native share sheet where it exists (a phone
 * can send it into a chat), and a copy-to-clipboard fallback everywhere else.
 * The URL carries the token, so what is shared is exactly this page and nothing
 * about the database.
 */
import { useEffect, useRef, useState } from "react"
import { Check, Share2 } from "lucide-react"

import { Button } from "@/components/ui/button"

export function ShareButton({ title, text }: { title: string; text: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  async function share() {
    const url = window.location.href

    // Chrome exposes navigator.share on the desktop too, where headless/automated
    // contexts can leave the sheet pending forever. The sheet is a touch gesture,
    // so a coarse pointer is the test; everything else copies.
    const payload = { title, text, url }
    const onTouch = window.matchMedia("(pointer: coarse)").matches
    const canNative =
      onTouch &&
      typeof navigator.share === "function" &&
      (typeof navigator.canShare !== "function" || navigator.canShare(payload))

    if (canNative) {
      try {
        await navigator.share(payload)
        return
      } catch {
        // Dismissed or unsupported in this context — fall through to copying.
      }
    }

    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      timer.current = setTimeout(() => setCopied(false), 2200)
    } catch {
      // Clipboard blocked (no permission, insecure origin): leave the button quiet.
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={share} aria-live="polite">
      {copied ? (
        <>
          <Check className="size-3.5" aria-hidden />
          Link copied
        </>
      ) : (
        <>
          <Share2 className="size-3.5" aria-hidden />
          Share
        </>
      )}
    </Button>
  )
}
