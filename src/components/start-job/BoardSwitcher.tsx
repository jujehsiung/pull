"use client"

/**
 * Board switcher — the square beside the client's name.
 *
 * A board is a view, not a form field: so the control sits next to the heading
 * it changes, one click away, and opens a list of the boards this stylist has.
 * The current board is checked in ink — olive stays the agent's colour, so it
 * never marks navigation.
 */
import { Check, ChevronDown } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export interface BoardOption {
  id: string
  /** The job, e.g. "Dune Tour". */
  title: string
  /** The client, e.g. "Timothée Chalamet". */
  client: string
  looks: number
}

export function BoardSwitcher({
  boards,
  currentId,
  onSelect,
}: {
  boards: BoardOption[]
  currentId: string
  onSelect: (id: string) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon-sm"
          className="size-9 shrink-0"
          aria-label="Switch board"
        >
          <ChevronDown className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" collisionPadding={12} className="w-auto min-w-[260px]">
        <DropdownMenuLabel>Boards</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {boards.map((board) => (
          <DropdownMenuItem
            key={board.id}
            onClick={() => onSelect(board.id)}
            className="items-center gap-2 py-2"
            aria-current={board.id === currentId ? "true" : undefined}
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[13px] text-foreground">{board.title}</span>
              <span className="truncate text-[11px] text-muted-foreground">
                {board.client} · {board.looks} look{board.looks === 1 ? "" : "s"}
              </span>
            </span>
            {board.id === currentId ? (
              <Check className="size-3.5 shrink-0 text-foreground" aria-hidden />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
