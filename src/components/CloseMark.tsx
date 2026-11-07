/**
 * The close mark — the site menu's hamburger, frozen in its X.
 *
 * Two hairlines crossing as one object: the same 28px lines, the same 1px
 * weight, the same ±45° the header animates into (SiteMenu.tsx). The dialog
 * therefore closes with the mark the site opens with, instead of a stock 2px
 * icon from a different family.
 */

export function CloseMark() {
  return (
    <span aria-hidden className="flex flex-col items-center justify-center">
      <span
        className="block h-px w-7 bg-foreground"
        style={{ transform: "translateY(3.5px) rotate(45deg)" }}
      />
      <span
        className="mt-[7px] block h-px w-7 bg-foreground"
        style={{ transform: "translateY(-3.5px) rotate(-45deg)" }}
      />
    </span>
  )
}
