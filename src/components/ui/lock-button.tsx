"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../../lib/utils"

/**
 * LockButton — a lock that opens when you press it.
 *
 * The glyph is lucide's Lock, split into its two parts so the shackle can move: the body stays put and the
 * shackle **swings about its right foot**, from shut to ~35° open. Two elements, one transition — no second icon
 * swapped in, because a swap cannot show *which way* the lock went.
 *
 * Left-to-right is the whole point: the free end lifts away from the body on the left, so the motion reads as
 * "opening" even at 16px and in a screenshot. The angle is fixed rather than springy — a lock is a state, not a
 * flourish, and the kit's motion language is a transition, not a bounce.
 *
 * `aria-pressed` carries the state; the rotation alone is decoration and never the only signal.
 */
const lockButtonVariants = cva(
  "group/lock inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-colors outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-transparent text-foreground",
        outline: "border border-input bg-transparent hover:bg-muted",
        ghost: "bg-transparent text-muted-foreground hover:text-foreground",
      },
      size: {
        default: "h-9 min-w-9 px-2",
        sm: "h-8 min-w-8 px-1.5",
        lg: "h-10 min-w-10 px-2.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const glyphSize = {
  default: "size-4",
  sm: "size-3.5",
  lg: "size-5",
} as const

function LockGlyph({
  locked,
  className,
  strokeWidth = 2,
}: {
  locked: boolean
  className?: string
  strokeWidth?: number
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={cn("overflow-visible", className)}
    >
      {/* the body: lucide Lock's rect, unmoved */}
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      {/* the shackle: lucide Lock's path, hinged at its right foot so the left end lifts */}
      <path
        d="M7 11V7a5 5 0 0 1 10 0v4"
        data-lock-shackle=""
        style={{
          transformBox: "view-box",
          transformOrigin: "17px 11px",
          transform: locked ? "rotate(0deg)" : "rotate(35deg)",
          transition: "transform 260ms cubic-bezier(0.2, 0.8, 0.2, 1)",
        }}
      />
    </svg>
  )
}

function LockButton({
  locked,
  onLockedChange,
  className,
  variant,
  size = "default",
  label,
  children,
  disabled,
  ...props
}: Omit<React.ComponentProps<"button">, "onChange" | "children"> &
  VariantProps<typeof lockButtonVariants> & {
    locked: boolean
    onLockedChange?: (locked: boolean) => void
    /** Accessible name. Defaults to the state: "Lock" when open, "Unlock" when shut. */
    label?: string
    children?: React.ReactNode
  }) {
  return (
    <button
      type="button"
      aria-pressed={locked}
      aria-label={label ?? (locked ? "Unlock" : "Lock")}
      data-state={locked ? "locked" : "unlocked"}
      disabled={disabled}
      onClick={() => onLockedChange?.(!locked)}
      className={cn(lockButtonVariants({ variant, size }), className)}
      {...props}
    >
      <LockGlyph locked={locked} className={glyphSize[size ?? "default"]} />
      {children ? <span>{children}</span> : null}
    </button>
  )
}

export { LockButton, LockGlyph, lockButtonVariants }
