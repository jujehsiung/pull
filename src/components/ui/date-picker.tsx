"use client"

import * as React from "react"
import { format, parseISO } from "date-fns"
import { ChevronDownIcon } from "lucide-react"

import { cn } from "../../lib/utils"
import { Button } from "./button"
import { Calendar } from "./calendar"
import { Popover, PopoverContent, PopoverTrigger } from "./popover"

/**
 * DatePicker — the shadcn date-picker composition (Popover + Calendar + Button) on EVA tokens.
 *
 * The shadcn docs ship this as an example, not a registry component, because it is a *composition*:
 * `Popover` for dismissal, `Calendar` for the grid, `Button` for the trigger. This is that same
 * composition, with three products-driven differences:
 *
 *  1. **Radix, not Base UI.** shadcn's `base` flavour uses Base UI's `render` prop on the trigger;
 *     EVA's primitives are Radix (`CONTRIBUTING`: "Radix behaviour … is the floor"), so the trigger is
 *     `asChild`. Same markup, same look, one primitive library in the kit.
 *  2. **ISO strings, not `Date`.** Every date in a Brand OS is stored as `yyyy-mm-dd` (a Postgres
 *     `date`), so the component speaks that and only converts at the edge.
 *  3. **A hidden input when `name` is given.** The intake forms are server components with server
 *     actions; the picker must post its value like any other field, with no client state hoisted.
 *
 * Muen tokens: the trigger is `variant="outline"` (border, ink text) and the placeholder is
 * `text-muted-foreground` via `data-empty`. Selection inside the calendar is `--primary` ink, "today"
 * is `--accent` — a surface, because the Muen theme has no brand accent hue.
 */

export type DatePickerProps = {
  /** Controlled ISO date (`yyyy-mm-dd`). Omit for an uncontrolled picker seeded by `defaultValue`. */
  value?: string | null
  defaultValue?: string | null
  onChange?: (iso: string) => void
  /** Renders a hidden input under this name, so a `<form action={serverAction}>` posts the value. */
  name?: string
  id?: string
  placeholder?: string
  /** Days that cannot be chosen — a show date cannot precede the material-order lead time. */
  disabled?: React.ComponentProps<typeof Calendar>["disabled"]
  disabledTrigger?: boolean
  /** Defaults to the shadcn `PPP` (“January 6, 2026”); pass `"d MMM yyyy"` where space is tight. */
  dateFormat?: string
  className?: string
  "aria-label"?: string
}

function toDate(iso: string | null | undefined): Date | undefined {
  if (!iso) return undefined
  const parsed = parseISO(iso)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

export function DatePicker({
  value,
  defaultValue,
  onChange,
  name,
  id,
  placeholder = "Pick a date",
  disabled,
  disabledTrigger,
  dateFormat = "PPP",
  className,
  "aria-label": ariaLabel,
}: DatePickerProps) {
  const controlled = value !== undefined
  const [internal, setInternal] = React.useState<Date | undefined>(
    toDate(controlled ? value : defaultValue)
  )
  const [open, setOpen] = React.useState(false)

  const date = controlled ? toDate(value) : internal

  function choose(next: Date | undefined) {
    if (!next) return
    if (!controlled) setInternal(next)
    onChange?.(format(next, "yyyy-MM-dd"))
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          data-empty={!date}
          disabled={disabledTrigger}
          aria-label={ariaLabel}
          className={cn(
            "w-[212px] justify-between text-left font-normal data-[empty=true]:text-muted-foreground",
            className
          )}
        >
          {date ? format(date, dateFormat) : <span>{placeholder}</span>}
          <ChevronDownIcon data-icon="inline-end" />
        </Button>
      </PopoverTrigger>

      {name ? <input type="hidden" name={name} value={date ? format(date, "yyyy-MM-dd") : ""} /> : null}

      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={choose}
          defaultMonth={date}
          disabled={disabled}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  )
}
