# DESIGN.md — PULL's design contract

PULL wears the **EVA** design system (`@muen/eva`) with its own values. EVA supplies the token
vocabulary and the shadcn/Radix primitives; Pull supplies the palette. This file is the contract
between design and code — if it and the code disagree, that is a defect, not a backlog item.

> **The rule that matters most:** components never carry a hex. They reference a token. The token
> values below are the only place a colour is written down.

---

## 1. Where things live

| File | What it is |
|---|---|
| `src/styles/pull-theme.css` | **The theme.** Every value, both modes. This is the file to edit. |
| `src/styles/eva/theme.css` | **Vendored EVA base** — the `@theme inline` mapping + Tailwind state variants. Values-free, byte-identical to upstream `@muen/eva` v0.6.0. Never put Pull colours here. |
| `src/styles/pull-bridge.css` | **Deprecated alias layer.** ~180 old references (`--paper`, `--ink`, `--mono`…) resolve here. Retire it line by line. |
| `src/app/globals.css` | The app's own sheets; imports the three above in order. |
| `src/components/ui/` | EVA's 29 primitives, copied in (the shadcn model). Yours to edit. |
| `src/lib/utils.ts` | `cn()` — the primitives' relative import resolves here. |
| `src/app/design/` | **The living canvas.** `/design` renders the palette, type scale and every primitive at both modes. |
| `components.json` | shadcn CLI config, pointed at `src/app/globals.css`. |
| `scripts/check-tokens.mjs` | **The gate.** Completeness, WCAG AA, dangling refs. |

**Import order is load-bearing.** `eva/theme.css` declares Dark EVA (Unit-01) in `:root`; Pull's
block wins only because it comes after and matches the same element. Do not reorder.

---

## 2. Naming: what each token means

The vocabulary is shadcn's, so primitives written for shadcn work unchanged. Two names are the ones
people get wrong:

| Token | Means | Does **not** mean |
|---|---|---|
| `--muted` | a **surface** (pale grey background) | text |
| `--muted-foreground` | **text** on that surface | a surface |
| `--accent` | the **selection surface** (a chosen row, hover) | the brand colour |
| `--brand` | the brand colour — Pull's olive, and **the agent's colour**: what the agent did or proposes | a fill for buttons |
| `--primary` | the **primary action fill** — ink | the brand colour |
| `--tertiary` | error/destructive status | a third brand colour |

**Pull's primary action is ink, not olive.** The olive is emphasis only: step numbers, the selected
rate card, the focus ring. A screen with several olive fills has lost the hierarchy.

---

## 3. The palette

### Light — the studio (default)

| Token | Value | Contrast | Role |
|---|---|---|---|
| `--background` | `#f9f9f8` | — | paper |
| `--foreground` | `#0a0a0a` | 18.79:1 | ink |
| `--card` | `#ffffff` | — | raised surface |
| `--muted` | `#f2f2f1` | — | inset surface |
| `--muted-foreground` | `#6b6a66` | 5.14:1 | body secondary |
| `--muted-foreground-soft` | `#706b64` | 5.01:1 | eyebrow / meta |
| `--border` | `#e6e3e3` | 1.21:1 | hairline rule |
| `--input` | `#d5d2cd` | 1.43:1 | field boundary — see §7 |
| `--ring` | `#465907` | 7.40:1 | focus ring |
| `--brand` | `#465907` | 7.40:1 | olive emphasis |
| `--accent` | `#eceee2` | — | selection surface |
| `--accent-foreground` | `#2c2c2b` | 11.91:1 | ink on selection |
| `--primary` / `--primary-foreground` | `#0a0a0a` / `#f9f9f8` | 18.79:1 | ink action |
| `--secondary` | `#f2f2f1` | — | neutral button |
| `--tertiary` / `--tertiary-text` | `#b3261e` | 6.20:1 | destructive |
| `--success` | `#2f6b3a` | 6.07:1 | shipped / confirmed |
| `--warning` | `#8a5a00` | 5.63:1 | needs attention |
| `--info` | `#1f5fa8` | 6.11:1 | neutral notice |
| `--radius` | `0.375rem` | — | the chrome's corner; every `rounded-*` utility derives from it (sm 3.6 / md 4.8 / lg 6 / xl 8.4 px) |

### The lookbook material — fixed, not a mode

`--dark`, `--dark-2`, `--dark-3`, `--dark-line`, `--dark-text`, `--dark-muted`, `--dark-ok`.

The client board is a dark lookbook that clients open from a link, and it stays dark **inside a light
page** (the landing page shows one framed as a "screenshot"). It is therefore not dark mode and does
not flip with `data-mode`. It is declared once in the theme and never re-declared in the dark block.

| Token | Value | Contrast |
|---|---|---|
| `--dark` | `#0b0b0c` | — |
| `--dark-2` | `#121214` | — |
| `--dark-line` | `#26262a` | — |
| `--dark-text` | `#f4f4f2` | 17.86:1 |
| `--dark-muted` | `#8f8f95` | 6.12:1 |
| `--dark-ok` | `#8fd98f` | 11.70:1 |

### Dark — unused today, complete by contract

Set `data-eva-theme="pull" data-mode="dark"` **on the same element** (EVA selects on the compound, so
a nested dark region restates both attributes). The app ships light only; the block exists because an
incomplete theme silently falls back to Dark EVA one token at a time, and nothing errors.

### The title token — the H2 step (2026-11-06)

`--title-size` / `--title-tracking` / `--title-leading` (in `src/styles/pull-theme.css`) are the H2
step: `clamp(28px, 3.6vw, 44px)` / `-0.03em` / `1.08` — the same values `/design` shows as `h2`. The
dialog title (`DialogTitle`) reads them, so a surface leader is an H2 without the primitive
hard-coding a size, and the step changes in one place. **44px at 1440.**

**The wordmark is `Pull.`** — title case, one capital, the period kept (2026-11-07). It is the one
mark that is neither all caps nor a label: the period makes it a mark, so it stays as drawn, and its
wide tracking went with the caps (`0.01em` now, not `0.22em`).

Two deliberate deltas from the canvas specimen: the title is set **extrabold** (the wordmark's
weight, asked for explicitly), where the canvas H2 runs `font-medium`; and the hero keeps its own,
larger scale (`clamp(52px, 8.6vw, 128px)`) — the title is not competing with the masthead. Type,
like shape, does not vary by mode, so the tokens live in the default scope only and the dark block
does not restate them.

---

## 4. Case — no all caps

**No all caps (2026-11-06).** Not `text-transform: uppercase`, not a display `toUpperCase()`, not
literal capitals standing in for emphasis. The reference sites did their small work in caps and wide
tracking; that is the one part of them Pull does not take — at 11px caps cost legibility rather than
gaining weight, and a page of them reads like a shop sign.

Reach for these instead, in this order:

1. **Size and weight** — 11px → 12/13px, regular → 500.
2. **Tracking** — a hair open (`0.02em`), not the `0.16em` that exists only to let caps breathe.
3. **Colour** — `--muted-foreground-soft` for the aside, ink for the label.
4. **A hairline or a gap** — separate with the rule, not with shouting.

What keeps its casing: **data** — season and month codes (`AW26`, `SS26`), currency (`USD`), country
codes and dedupe keys; **initialisms** (`CSV`, `UTC`, `OK`); the **wordmark** (`Pull.`), which is a
mark; and **source content** (a brand that writes itself in caps). Everything that is *our words* is
sentence case — a label, a heading, a status, a tag.

Enforced by `npm run tokens:check`: the case scan fails on `text-transform: uppercase`, on
`uppercase` in a class name, and on a display `toUpperCase()`. A legitimate data call carries
`// case-exempt: data` on its line (§8).

## 5. Resolved inconsistencies

These were real conflicts, decided once. Do not re-litigate them in a component.

**`--muted` and `--accent` collided with the kit.** Pull's raw palette used `--muted` for a *text*
colour and `--accent` for the *olive brand*. Both are reserved names in shadcn, so a shadcn checkbox
or hover state would silently render with the wrong job. Migrated at the call sites:

| Was | Now | Sites |
|---|---|---|
| `var(--accent)` (olive) | `var(--brand)` | 12 |
| `var(--accent-soft)` | `var(--accent)` | 6 |
| `var(--muted)` (text) | `var(--muted-foreground)` | 32 |
| `var(--muted-2)` (text) | `var(--muted-foreground-soft)` | 37 |

Everything else is aliased in `pull-bridge.css` and costs nothing.

**`--muted-2` failed WCAG AA.** It was `#8f8b85` — **3.22:1** on paper, at 11px, on 37 sites
(eyebrows, meta, fine print). Raised to `#706b64` (**5.01:1**). Consequence: the two grey tiers now
sit close in weight, so that hierarchy is carried by **size, weight and tracking** (11px mono,
uppercase, 0.16em) rather than by value. Do not darken `--muted-foreground` to widen the gap; it is
already at 5.14:1 and the page's calm depends on it.

**Radius is for the chrome, never for the content (2026-11-06, revised).** The base token is
`0.375rem` and it is deliberately restrained: primitives derive sm 3.6 / md 4.8 / lg 6 / xl 8.4px, so
a field or a card carries a corner you notice only at the edge. Three families are pinned by rule:

- **Buttons are square — except the agent's.** A button is the action; it keeps the references' hard
  edge (`ui/button.tsx` is `rounded-none` at every size, and the legacy `.btn` was already 0). The one
  exception is an **agent action**: it is a solid success-green pill (`.agent-action`), because what
  the agent does is one gesture wherever it appears — Draft requests, Polish, Suggest looks. Human
  buttons stay square; pills are not otherwise a button shape.
- **A trigger is a control, not an action.** The dropdown's trigger (`DatePicker`) takes the field
  radius, because it reads as the field it opens; only the things you *do* stay hard.
- **Thumbnails are square.** A look is a photograph, not a card. Board tiles, the import queue,
  the studio grid and the client deck are all `border-radius: 0`. The one exception is the
  shortlist preview inside the client-send popover: those are ~100px proofs of what the client is
  about to receive, not board photography, so they take the chrome's `md` radius.
- **The look grid separates with rules, not gutters.** Cells touch: the 1px
  hairline is the spacing, the same thin separation the landing strip uses. The
  board is a contact sheet of photographs, not a set of cards.
- **A tile's actions are circles.** The +/×/check that appear on hover sit *on a photograph*, so they
  are round (white with a border; brand-green when shortlisted) — the one round button family. Page
  actions stay square.
- **Calendar days are circles.** The one fully round primitive: a date is a point on a grid, not a
  cell, so hover, today, focus and selection are all the same `rounded-full` mark — the grid never
  paints a square.

**Floating panels take the top step.** Popover, dropdown and select lists are `rounded-xl` (8.4px) —
more than the field they open from — so a sheet still reads as a sheet floating above the page
instead of inheriting the reduced field corner.

The split is the point: **hard edges on what you press and what shows the work; soft edges on the
software around it.** Pull's older sheets still draw corners from `--r-sm/--r-md/--r-lg`; those are
containers and inputs, not buttons or thumbnails, so they are left alone.

**Olive is the agent's colour (2026-11-06).** The agent is a second author, never the voice, so
anything it participates in wears olive as its *secondary* mark: the sparkle badge on a suggested
look, the "Suggest looks" action (`.agent-action`), the count it reports back (`.agent-mark`), a
running trace step's dot, the live provider dot in the badge. Ink stays primary; per §2 a screen with
several olive fills has lost the hierarchy. Olive never becomes body copy, and it is never the
fill of a button — the agent does not get to be louder than the work. Navigation is not the agent
either: the board switcher marks the current board in ink, and the check in its menu is ink.

**The gutter is a blur filter (2026-11-06).** On the landing, the look band is full-bleed and its two
outer gutters are frosted glass — `backdrop-filter: blur(18px)` on a band whose width tracks the
content gutter (`clamp(24px, 2.8vw, 40px)`; **40px at 1440**, the same inset the H1 and hairline rules
start at), masked to nothing at the inner edge so the filter has no seam. A look leaves the frame out
of focus instead of on a hard vertical cut. This is a *treatment*, not a colour: it writes no hex and
adds no token, so it does not widen the theme surface.

---

## 6. Using the primitives

```tsx
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

<Button>Publish board</Button>          // ink — the primary action
<Button variant="outline">Copy link</Button>
<Badge variant="destructive">contact missing</Badge>
```

- **EVA first.** The kit's props (`variant`, `size`, `spacing`, `orientation`) express intent.
  Reach for a class only for layout.
- **Semantic utilities only:** `bg-background`, `text-foreground`, `text-muted-foreground`,
  `text-brand`, `border-border`, `ring-ring`, `font-mono`. A raw hex or `bg-[#f9f9f8]` fails review.
- **Red is status, never an action.** Delete, fail, blocked — `destructive`. The primary action is ink.
  A **count is not a badge**: the shortlist count is a square the button's own height, butted
  against its right edge, dressed in the same green the shortlisted check uses (`--success`, numeral
  in `--success-foreground`) — a split control, not a floating dot. It exists only when there is
  something to count.
- **Add a component rather than butcher one.** If a screen needs a variant the kit lacks, add the
  variant (and register it here) instead of overriding its classes at the call site.
- **Dialog titles read `--title-size`** (§3). A dialog title is never sized at its call site; the
  token is the single number.
- **Markup is a pen, not a highlight.** A client circles a piece with the status red
  (`--destructive`, 5px, no underlay), and the rings come back on the thumbnails as one layer with a
  single eye in the page bar — "Markup" — that shows or hides every ring at once. The toggle only
  exists once something is marked. It marks a photograph, never a control — red stays a status
  colour in the chrome.
- **A mark is olive; a verb is a green pill.** The agent's presence is olive (the sparkle, the
  running step's dot, the suggested badge); the agent's *actions* are solid success green. Two
  colours, two jobs: one says "the agent did this", the other says "press this to have the agent do".
- **Icons are hairlines.** Every Lucide icon strokes at **1.5** in the 24-unit box — one rendered
  pixel at a 16px icon, set once for `.lucide` in `globals.css`, never the library's 2. An icon is a
  rule that happens to bend.

---

## 7. Open item — form boundaries

`--input` (`#d5d2cd`) is **1.43:1** against paper. WCAG 1.4.11 wants 3:1 for the boundary of a form
control. This is inherited from the reference design, whose whole character is hairline rules, and the
focus ring does carry 7.40:1. Two honest options:

1. **Accept it, documented** — inputs are identifiable by shape and focus state; the hairline look
   survives. This is what the reference does.
2. **Raise `--input` to ≈`#8a857e`** (3.0:1) — compliant, but every field gains a visibly darker edge.

Not decided. If a field ever becomes the only way to identify a control, this must change.

---

## 8. Checking it

```sh
npm run tokens:check      # completeness · 33 AA pairs · dangling refs
npx tsc --noEmit          # primitives typecheck
```

`tokens:check` reads the required-token list **out of** `src/styles/eva/theme.css`, so it tracks the
kit instead of drifting from it. A new token the kit consumes but the theme omits fails the gate. A
value that fails AA fails the gate. A typo'd `var(--tokn)` fails the gate.

Visual review: `/design` (the living canvas — both modes, every primitive).

---

## 9. The studio canvas (2026-11-07)

The studio (`/canvas`) is the one surface that is a **canvas**, and it takes the NERV language without
taking its colours: numbered steps, technical labels, hairlines, and the same near-white paper.

- **Cards carry the `lg` radius** (6px, `rounded-lg`) and a hairline — the same shape a card takes
  everywhere else. A socket is still a **square**, flush to the edge: the radius belongs to the card, not
  to the plug (2026-11-07). The selected card is the only one that changes, to `outline-foreground/40`.
- **Floating chrome takes the `xl` step** (8.4px) — the toolbox and the node palette are sheets above the
  canvas, so they round one step more than a card, per §5.
- **On this page every primitive rounds** (2026-11-07) — cards `lg`, controls `md`, media frames `md`/`sm`,
  floating chrome and the assets panel `xl`, the edge tab `lg` on its outer corners. It is the one surface
  that should read as an **app**, not as a printed sheet; the square button rule still holds everywhere else
  in the product. A socket stays a circle.
- **The step number is mono, 10px, muted** (`01`…`06`) and it is the only thing on the card's left edge
  before the name. It is data, not a label, which is why it may keep its width.
- **Sockets are rows, not a mid-line** (2026-11-07): every input is a labelled square on the card's left
  edge, in the order the model takes them — the edit step lists `prompt`, then `ref 1`…`ref 5`, which is
  exactly the five images and one prompt its models accept. Outputs are labelled squares on the right.
  A wire is drawn between the two rows it joins, so the graph reads as the model's signature rather than
  as a bundle of anonymous lines. Each socket is 8px, square, and filled when it has a wire.
- **One wire per socket**: dropping a second wire on an occupied input replaces the first — the same way
  the model takes one prompt, not two. Dropping requires the socket you mean; there is no "nearest port".
- **The noodle is a direct object** (2026-11-07): pressing an output socket starts a wire *at that socket*
  (anchored on the element, not on arithmetic), the socket under the pointer lights olive while dragging,
  and releasing over an input row — the whole row, dot and label — wires that socket. Releasing over
  anything else cancels. There are two ways to unpick, because a wire has two ends to name: click a wired
  input socket, or click the wire itself (it has a 14px invisible hit stroke and thickens on hover).
- **One olive state, one green state**: the step in flight turns its border olive and its dot pulses;
  a finished step is a green dot. There is no third colour on the canvas.
- **The run is visible, not implied** — `Agent run · n/6` in the surface header, and each card's footer
  shows what that step cost (`1.6s`) once it has run.
- **The assets panel is entered from the right edge of the viewport**, through a vertical tab that rides
  with the panel — not from a button in the header. A panel you open dozens of times a session belongs to
  the edge, where the hand already is, and a tab costs no row of chrome.
- **The assets panel is a column, not an overlay**: above 768px the canvas gives it exactly its measured
  width and refits, so nothing hides behind it. Below 768px there is no column to give, so it slides
  over the canvas like a drawer — the one place the same panel behaves two ways, and deliberately.
- **Type never goes below 10px effective**: `fit()` floors the zoom at 45% so a narrow frame pans
  instead of shrinking the cards into unreadability.
- **The toolbox is centred at the bottom of the canvas**, not of the page: the things you do *to* the
  canvas (add a node, zoom, fit) live on the canvas; the things you do *with* it (assets, run) stay in
  the surface header. It floats, so it never takes a row from the graph, and its palette opens upward.
- **A step number is assigned once**, when the card is created, and never renumbers: pasting a prompt
  makes it `07`, it does not push the pipeline to `04`. The number is the card's handle, not its rank.
- **A limit is shown, not discovered**: the edit step reads `n / 5` beside its references, because the
  model's ceiling is part of the decision, not an error you meet after the sixth image.
- **The wheel is zoom**, anchored on the pointer: the canvas point under the cursor stays under the
  cursor. Nothing else on this page scrolls, so the wheel is free to mean zoom.

---

## 10. The demo guide (2026-11-07)

The hackathon demo is a script with three acts (`DEMO.md`), so the demo surfaces carry one chrome row
above them: **the acts as a track, the act in hand named with its instruction, and the press that moves
the story on.** It is rendered from the root layout and precedes the site header, the studio header and
the dark client board alike.

- **A guide is chrome, not content.** Hairline, hard corner, no fill of its own beyond `--card`; the live
  act's **number** is the only olive on the row, and the act's **name** — never its instruction — carries
  the weight. The instruction is `--muted-foreground`, one line, ellipsised, hidden below 900px.
- **The acts are a track, not a menu.** Three labelled steps divided by hairlines; the current one is ink
  with a brand number, the others are secondary. Every step is a link to the screen that act opens with,
  so the guide is also the fastest way to jump between acts mid-story.
- **Act 1 opens `/board`, not `/studio`** (2026-11-07). `/studio` sits behind `requireStylist`, so a
  logged-out visitor — a judge, a phone, a fresh browser — bounced to `/login` and the guide dead-ended
  on its first press, and `start over` (which returns to Act 1) did the same. The public board is the
  act's own surface; the studio is where it is made, reached from the site nav once signed in.
- **`next` is a square control**, the same hard edge as every other button; `hide` is a text button with
  no boundary. The agent's pill is not borrowed here — nothing on this row is an agent action.
- **Collapse, never vanish.** `hide` shrinks the row to one 44px line that names itself and restores in
  one press, remembered per browser. A guide that can be lost with no way back is a trap on stage.
- **Not on the doors.** `/login`, `/setup`, `/design`, `/canvas` and `/trace` are not the demo and render
  no guide. The act a route belongs to is derived from the pathname, not from state: `/b/*` and `/client`
  are Act 2, `/i/*`, `/requests` and `/studio/jobs/*/requests` are Act 3, everything else in the guide
  is Act 1.

---

## 11. The look workflow (2026-11-07)

The studio's six-card graph is the demo's picture of the product: **four references in, one look out.**

- **The references are not labelled — on purpose.** Four plain image sockets (`ref 1…4`), no roles on
  the cards, no role tags in the compose card. What a picture contributes is read from the picture and
  from the border the stylist drew, not from a label the presenter has to keep in their head. The
  reading model infers which reference is the person and which are garments, and the prompt it writes
  says so; a re-run reuses that prompt.
- **The mark is the pen, and it belongs to the vision pass only, and it is red.** Press `mark` on an
  image card and drag a border around the piece: red is the markup colour (DESIGN.md §6's pen colour),
  distinct from the olive the agent's own state uses. The border is baked into the copy the reading
  model sees; the **render** gets the clean copies, because a border baked into a reference would be
  rendered into the photograph.
- **One compose card does the work.** It reads the marked references, writes the prompt, then calls
  `image_generate` with the clean references and that prompt on `gpt-image-2`, and shows both the
  prompt and the render. The prompt is a textarea: edit it and run again, and the assistant is skipped.
- **A demo never dead-ends.** If the vision pass fails, a template prompt that names no roles still
  renders; if the provider is unreachable, the graph stops on the failed card but the assets panel
  fills with labelled sample output (`provider unavailable — …`).
- **A run is a real run.** Compose shows real latency (≈80–120 s for the four references on the demo
  fixtures). The footer's time before a run is the estimate; after it, the measured value.
- **Saving is the only way into the assets.** The save card writes the render into the panel and the
  panel opens itself; nothing else populates it.
- **A card moves by its whole surface** (2026-11-07). Pointer-down anywhere that is not a control
  starts the drag, so the title bar is no longer the only handle; buttons, fields, sockets and the
  resize grip keep their own gestures, and the image body drags the card when `mark` is off (when it
  is on, the same drag draws a border instead).
- **An image card is a Finder drop target** (2026-11-07). Drag a JPEG/PNG/WebP from Finder onto it and
  the picture is replaced — downscaled to 1400 px on the long edge, the filename becomes the caption,
  and any borders on the old picture are cleared, because they described the picture that left. A
  dashed red frame and `drop to replace` appear while the file is over the card.
- **A card resizes from its corner** (2026-11-07). The grip sits in the bottom-right corner — drag it,
  or focus it and use ← / →. Width runs 220–640 canvas units, height follows the content, and the
  render preview grows with the card: the save card is where the look is finally looked at, so it is
  the card people make big. The width survives copy/paste with the rest of the card's settings; it
  resets with the canvas, because the graph itself is not persisted.
