"use client"

import * as React from "react"
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui"
import { type VariantProps } from "class-variance-authority"

import { cn } from "../../lib/utils"
import { toggleVariants } from "./toggle"

/**
 * ToggleGroup — a set of toggles used as one control.
 *
 * shadcn's current structure: the group is **separate buttons by default** (`spacing={2}`), and
 * `spacing={0}` joins them into a single segmented bar. That default changed upstream on 2026-05-17 and it is the
 * right way round for this kit too — a row of buttons reads as choices; a joined bar reads as a mode switch, and
 * that is a decision the caller should make, not one it inherits.
 *
 * Radix owns the behaviour: `type="single"` is a radio group (one answer), `type="multiple"` a pressed-button
 * group, with roving focus and the ARIA either way. The group carries `variant`, `size`, `spacing` and
 * `orientation` down to its items through context, because a group whose items disagree is not a group.
 */
type Orientation = "horizontal" | "vertical"

type ToggleGroupContextValue = VariantProps<typeof toggleVariants> & {
  spacing: number
  orientation: Orientation
}

const ToggleGroupContext = React.createContext<ToggleGroupContextValue>({
  size: "default",
  variant: "default",
  spacing: 2,
  orientation: "horizontal",
})

function ToggleGroup({
  className,
  variant,
  size,
  spacing = 2,
  orientation = "horizontal",
  children,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root> &
  VariantProps<typeof toggleVariants> & {
    /** Gap between items in 4px steps. `0` seams them into one control. */
    spacing?: number
    orientation?: Orientation
  }) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      data-variant={variant}
      data-size={size}
      data-spacing={spacing}
      data-orientation={orientation}
      orientation={orientation}
      style={{ "--toggle-group-gap": `${spacing * 0.25}rem` } as React.CSSProperties}
      className={cn(
        "group/toggle-group flex w-fit items-center gap-[var(--toggle-group-gap)] data-[orientation=vertical]:flex-col data-[variant=outline]:shadow-xs",
        className
      )}
      {...props}
    >
      <ToggleGroupContext.Provider value={{ variant, size, spacing, orientation }}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive.Root>
  )
}

function ToggleGroupItem({
  className,
  children,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item> &
  VariantProps<typeof toggleVariants>) {
  const context = React.useContext(ToggleGroupContext)
  const spacing = context.spacing ?? 2
  const connected = spacing === 0

  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      data-variant={context.variant || variant}
      data-size={context.size || size}
      className={cn(
        toggleVariants({
          variant: context.variant || variant,
          size: context.size || size,
        }),
        "min-w-0 shrink-0 shadow-none focus:z-10 focus-visible:z-10",
        connected
          ? "rounded-none first:rounded-l-md last:rounded-r-md data-[variant=outline]:border-l-0 data-[variant=outline]:first:border-l"
          : "rounded-md",
        className
      )}
      {...props}
    >
      {children}
    </ToggleGroupPrimitive.Item>
  )
}

export { ToggleGroup, ToggleGroupItem }
