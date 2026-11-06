"use client"

import { useState } from "react"

/** Copy needs the clipboard API, so it stays a client island inside an otherwise server form. */
export function CopyLinkButton({ value }: { value: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle")

  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setState("copied")
          setTimeout(() => setState("idle"), 1500)
        } catch {
          setState("failed")
        }
      }}
    >
      {state === "copied" ? "Copied" : state === "failed" ? "Select & copy" : "Copy"}
    </button>
  )
}
